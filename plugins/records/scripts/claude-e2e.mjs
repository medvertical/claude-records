#!/usr/bin/env node
// Claude Code end-to-end check for the records plugin, mirroring the tiered
// design of codex-e2e.mjs. Created after v0.8.2 changed the reviewer agent's
// tool surface (disallowedTools → explicit allow-list) and shipped with zero
// runtime verification: `claude plugin validate` checks manifests, never
// whether the agent still loads its declared skill under the allow-list.
//
// Staged tier (always): structural assertions against a staged copy — the
// agent's allow-list is exactly the audited five tools, its declared skill
// resolves on disk, every skill reference file exists, and the pinned CLI
// validates the staged plugin strictly.
//
// Live tier (RECORDS_CLAUDE_E2E_LIVE=1): runs the pinned CLI headless with
// --plugin-dir and --agent so the session IS the reviewer agent, then asserts
// from the stream-json transcript that (a) the agent can read its skill
// references, (b) a requested Write probe never lands on disk, and (c) every
// tool the agent actually used is inside the allow-list.
import { access, cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../skills/fhir-validation/scripts/lib/process-runner.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const plugin = path.resolve(scriptDir, "..");
const repo = path.resolve(plugin, "../..");
const failures = [];
const AUDITED_TOOLS = ["Read", "Grep", "Glob", "Bash", "Skill"];
// The pinned CLI from devDependencies, resolvable regardless of cwd.
const claudeBin = path.join(repo, "node_modules/.bin/claude");

async function exists(file) {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

function frontmatter(markdown) {
  const match = markdown.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  const fields = {};
  for (const line of match[1].split(/\r?\n/)) {
    const pair = line.match(/^([A-Za-z_-]+):\s*(.*)$/);
    if (pair) fields[pair[1]] = pair[2].trim();
  }
  return fields;
}

const stageRoot = await mkdtemp(path.join(os.tmpdir(), "records-claude-e2e-"));
const staged = path.join(stageRoot, "records");

try {
  await cp(plugin, staged, { recursive: true, dereference: false });

  // Agent contract: the exact allow-list the ClaudeRegistry badge attests.
  const agentSource = await readFile(path.join(staged, "agents/fhir-validation-reviewer.md"), "utf8");
  const agent = frontmatter(agentSource);
  if (!agent) failures.push("Reviewer agent has no frontmatter.");
  const declaredTools = (agent?.tools || "").replace(/[[\]"\s]/g, "").split(",").filter(Boolean);
  if (JSON.stringify(declaredTools) !== JSON.stringify(AUDITED_TOOLS)) {
    failures.push(`Reviewer allow-list drifted: expected ${AUDITED_TOOLS.join(",")}, found ${declaredTools.join(",") || "(none)"}.`);
  }
  if (agentSource.includes("disallowedTools")) {
    failures.push("Reviewer agent regressed to a disallowedTools denial list.");
  }
  if (!/skills:\s*\r?\n\s*-\s*fhir-validation/.test(agentSource)) {
    failures.push("Reviewer agent no longer declares the fhir-validation skill.");
  }

  // The declared skill and every reference it names must resolve on disk.
  const skillPath = path.join(staged, "skills/fhir-validation/SKILL.md");
  if (!(await exists(skillPath))) {
    failures.push("Declared skill fhir-validation has no SKILL.md in the staged plugin.");
  } else {
    const skill = await readFile(skillPath, "utf8");
    for (const reference of new Set(skill.match(/references\/[A-Za-z0-9._-]+\.md/g) ?? [])) {
      if (!(await exists(path.join(staged, "skills/fhir-validation", reference)))) {
        failures.push(`Skill references missing file: ${reference}.`);
      }
    }
  }

  // Post-install fixture reachability: commands must point at the plugin root
  // variable, not repo-relative paths that only exist in this checkout.
  for (const command of ["validate.md", "doctor.md", "explain-outcome.md"]) {
    const body = await readFile(path.join(staged, "commands", command), "utf8");
    if (!body.includes("CLAUDE_PLUGIN_ROOT")) {
      failures.push(`commands/${command} does not tell the model where bundled fixtures live post-install.`);
    }
  }

  // The pinned CLI must strictly validate the staged copy.
  const validate = runProcess(claudeBin, ["plugin", "validate", "--strict", staged], { cwd: repo, timeout: 120_000 });
  if (validate.status !== 0) {
    failures.push(`claude plugin validate --strict failed on the staged plugin:\n${validate.stderr || validate.stdout}`);
  }

  if (process.env.RECORDS_CLAUDE_E2E_LIVE === "1" && failures.length === 0) {
    const probe = path.join(stageRoot, "write-probe.txt");
    const prompt = [
      "Configuration self-check, not a FHIR task. Do exactly three things:",
      "1. Read the file references/operationoutcome-map.md that belongs to your fhir-validation skill and quote its first heading line verbatim.",
      `2. Attempt to create the file ${probe} with the content "probe" using the Write tool. If the tool is unavailable, state that plainly instead of working around it via Bash or any other tool — do not create the file another way.`,
      "3. End with the literal token SELF-CHECK-DONE.",
    ].join("\n");

    const live = runProcess(
      claudeBin,
      [
        "-p", prompt,
        "--plugin-dir", staged,
        "--agent", "fhir-validation-reviewer",
        "--output-format", "stream-json",
        "--verbose",
        "--max-turns", "10",
      ],
      { cwd: stageRoot, timeout: 300_000 },
    );
    if (live.status !== 0) {
      failures.push(`Live agent run failed (exit ${live.status}):\n${(live.stderr || live.stdout || "").slice(-1500)}`);
    } else {
      const events = (live.stdout || "").split(/\r?\n/).filter(Boolean).flatMap((line) => {
        try {
          return [JSON.parse(line)];
        } catch {
          return [];
        }
      });
      const transcript = JSON.stringify(events);
      const toolsUsed = new Set();
      for (const event of events) {
        for (const block of event?.message?.content ?? []) {
          if (block?.type === "tool_use") toolsUsed.add(block.name);
        }
      }
      if (!transcript.includes("OperationOutcome Issue Map")) {
        failures.push("Live agent could not read its skill reference (operationoutcome-map.md heading missing from transcript).");
      }
      if (!transcript.includes("SELF-CHECK-DONE")) {
        failures.push("Live agent never reached the end of the self-check protocol.");
      }
      if (await exists(probe)) {
        failures.push("Write probe landed on disk: the reviewer agent can write files.");
      }
      const outsideAllowList = [...toolsUsed].filter((name) => !AUDITED_TOOLS.includes(name));
      if (outsideAllowList.length) {
        failures.push(`Live agent used tools outside the audited allow-list: ${outsideAllowList.join(", ")}.`);
      }
      if (toolsUsed.size === 0) {
        failures.push("Live transcript contains no tool_use events; the run did not exercise the agent.");
      }
    }
  } else if (process.env.RECORDS_CLAUDE_E2E_LIVE !== "1") {
    const version = runProcess(claudeBin, ["--version"], { cwd: repo, timeout: 60_000 });
    if (version.status !== 0) {
      failures.push("Pinned Claude Code CLI is unavailable; run npm ci before the E2E check.");
    }
  }
} finally {
  await rm(stageRoot, { recursive: true, force: true });
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log(process.env.RECORDS_CLAUDE_E2E_LIVE === "1"
  ? "Claude Code staged checks and live reviewer-agent invocation passed."
  : "Claude Code staged checks passed; live agent invocation is opt-in via RECORDS_CLAUDE_E2E_LIVE=1.");
