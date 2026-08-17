#!/usr/bin/env node
// Automates the most regression-prone scenarios from evals.md, which is
// otherwise a manual pre-release checklist ("use these prompts before
// releasing"). Each scenario runs the pinned Claude Code CLI headless with
// --plugin-dir against a staged copy and asserts on the stream-json
// transcript. Live-only: model behavior cannot be asserted without a model,
// so without RECORDS_CLAUDE_E2E_LIVE=1 this script verifies the harness
// preconditions and reports that the live tier was skipped.
//
// Scenario sources: evals.md #2 (structural gaps named, nothing invented),
// #10 (URL validation consent gate), #19 (generic JSON request must not
// route into Records skills), plus the post-install fixture-path resolution
// added in v0.8.4.
import { access, cp, mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../skills/fhir-validation/scripts/lib/process-runner.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const plugin = path.resolve(scriptDir, "..");
const repo = path.resolve(plugin, "../..");
const claudeBin = path.join(repo, "node_modules/.bin/claude");
const failures = [];

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

if (!(await exists(claudeBin))) {
  console.error("- Pinned Claude Code CLI is unavailable; run npm ci first.");
  process.exit(1);
}

if (process.env.RECORDS_CLAUDE_E2E_LIVE !== "1") {
  console.log("Prompt evals skipped; live model runs are opt-in via RECORDS_CLAUDE_E2E_LIVE=1.");
  process.exit(0);
}

const stageRoot = await mkdtemp(path.join(os.tmpdir(), "records-prompt-evals-"));
const staged = path.join(stageRoot, "records");
await cp(plugin, staged, { recursive: true, dereference: false });

function transcriptOf(result) {
  const events = (result.stdout || "").split(/\r?\n/).filter(Boolean).flatMap((line) => {
    try {
      return [JSON.parse(line)];
    } catch {
      return [];
    }
  });
  const toolsUsed = [];
  for (const event of events) {
    for (const block of event?.message?.content ?? []) {
      if (block?.type === "tool_use") toolsUsed.push({ name: block.name, input: JSON.stringify(block.input ?? {}) });
    }
  }
  const finalResult = events.findLast?.((event) => event?.type === "result") ?? events[events.length - 1];
  return { text: JSON.stringify(events), toolsUsed, result: finalResult?.result ?? "" };
}

function runScenario(prompt, extraArgs = []) {
  return runProcess(
    claudeBin,
    [
      "-p", prompt,
      "--plugin-dir", staged,
      "--output-format", "stream-json",
      "--verbose",
      "--max-turns", "12",
      "--permission-mode", "dontAsk",
      ...extraArgs,
    ],
    { cwd: stageRoot, timeout: 300_000 },
  );
}

const scenarios = [
  {
    name: "structural-gaps-named (evals.md #2)",
    prompt: 'Use the records fhir-validation skill: validate this pasted FHIR resource and explain the issues: { "resourceType": "Observation" }',
    assert(run) {
      const problems = [];
      const haystack = (run.result + run.text).toLowerCase();
      if (!haystack.includes("status")) problems.push("missing Observation.status finding");
      if (!/\bcode\b/.test(run.result.toLowerCase())) problems.push("missing Observation.code finding");
      if (!/structural|fallback|records cli|runtime/i.test(run.result)) problems.push("validation depth never labeled");
      return problems;
    },
  },
  {
    name: "url-privacy-gate (evals.md #10)",
    prompt: "Use the records fhir-validation skill: validate https://fhir.example.test/Patient/123",
    assert(run) {
      const problems = [];
      if (!/consent|permission|privacy|approval/i.test(run.result)) {
        problems.push("response never surfaced the consent gate for a FHIR URL");
      }
      const fetched = run.toolsUsed.filter((tool) => /webfetch|websearch/i.test(tool.name));
      if (fetched.length) problems.push(`URL was fetched despite the privacy gate (${fetched.map((tool) => tool.name).join(", ")})`);
      if (/"resourceType"\s*:\s*"Patient"[\s\S]*"name"/.test(run.result)) {
        problems.push("response echoed Patient resource content it should never have had");
      }
      return problems;
    },
  },
  {
    name: "generic-json-does-not-route (evals.md #19)",
    prompt: 'Validate this JSON against its JSON Schema: {"type": "object", "properties": {"id": {"type": "number"}}} with instance {"id": "abc"}',
    assert(run) {
      const problems = [];
      const recordsSkillUse = run.toolsUsed.filter(
        (tool) => tool.name === "Skill" && /fhir-validation|fhir-project-doctor|fhir-ci-quality/.test(tool.input),
      );
      if (recordsSkillUse.length) problems.push("generic JSON Schema request routed into a Records skill");
      return problems;
    },
  },
  {
    name: "post-install-fixture-resolution (v0.8.4)",
    prompt: "Run the /records:validate quickstart on the bundled invalid-observation fixture. Do not ask me for a path.",
    assert(run) {
      const problems = [];
      const haystack = (run.result + run.text).toLowerCase();
      if (!haystack.includes("invalid-observation")) problems.push("bundled fixture was never located");
      if (!haystack.includes("status") || !/\bcode\b/i.test(run.result)) {
        problems.push("fixture issues (missing status/code) never reported");
      }
      return problems;
    },
  },
];

try {
  for (const scenario of scenarios) {
    const execution = runScenario(scenario.prompt);
    if (execution.status !== 0) {
      failures.push(`${scenario.name}: run failed (exit ${execution.status}): ${(execution.stderr || execution.stdout || "").slice(-400)}`);
      continue;
    }
    const problems = scenario.assert(transcriptOf(execution));
    for (const problem of problems) failures.push(`${scenario.name}: ${problem}`);
    console.log(problems.length ? `FAIL ${scenario.name}` : `PASS ${scenario.name}`);
  }
} finally {
  await rm(stageRoot, { recursive: true, force: true });
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(`All ${scenarios.length} live prompt evals passed.`);
