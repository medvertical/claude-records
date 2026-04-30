#!/usr/bin/env node
import { access, readFile, readdir, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";

const repo = path.resolve(new URL("../../..", import.meta.url).pathname);
const plugin = path.join(repo, "plugins/records");
const errors = [];

async function exists(file) {
  try {
    await access(file, constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function readJson(file) {
  try {
    return JSON.parse(await readFile(file, "utf8"));
  } catch (error) {
    errors.push(`${path.relative(repo, file)} is not valid JSON: ${error.message}`);
    return null;
  }
}

async function walk(dir) {
  const out = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (entry.name === ".git" || entry.name === "node_modules") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...(await walk(full)));
    else out.push(full);
  }
  return out;
}

function rel(file) {
  return path.relative(repo, file);
}

const marketplace = await readJson(path.join(repo, ".claude-plugin/marketplace.json"));
const manifest = await readJson(path.join(plugin, ".claude-plugin/plugin.json"));
if (marketplace?.name !== "medvertical") errors.push("Marketplace name must remain medvertical.");
if (manifest?.name !== "records") errors.push("Plugin name must remain records.");
if (marketplace?.plugins?.[0]?.name !== "records") errors.push("Marketplace plugin entry must remain records.");
if (marketplace?.plugins?.[0]?.version !== manifest?.version) errors.push("Marketplace and plugin versions differ.");
if (manifest?.version !== "0.2.0") errors.push("Expected plugin version 0.2.0.");

const required = [
  "README.md",
  "plugins/records/README.md",
  "plugins/records/skills/fhir-validation/SKILL.md",
  "plugins/records/skills/fhir-validation/references/ig-workflows.md",
  "plugins/records/skills/fhir-validation/references/repair-policy.md",
  "plugins/records/skills/fhir-validation/references/operationoutcome-map.md",
  "plugins/records/skills/fhir-validation/references/quality-rules.md",
  "plugins/records/skills/fhir-validation/scripts/detect-fhir-project.mjs",
  "plugins/records/commands/doctor.md",
  "plugins/records/commands/init-ci.md",
  "plugins/records/commands/explain-outcome.md",
  "plugins/records/commands/derive-quality-rules.md",
  "plugins/records/agents/fhir-validation-reviewer.md",
  "plugins/records/fixtures/invalid-observation.json",
  "plugins/records/fixtures/operationoutcome-required.json",
  "plugins/records/fixtures/mini-ig/input/fsh/profiles.fsh",
  "plugins/records/fixtures/mini-ig/sushi-config.yaml",
];
for (const file of required) {
  if (!(await exists(path.join(repo, file)))) errors.push(`Missing required file: ${file}`);
}

for (const file of await walk(plugin)) {
  if (!file.endsWith(".md")) continue;
  const text = await readFile(file, "utf8");
  for (const match of text.matchAll(/\]\(([^)]+)\)/g)) {
    const target = match[1];
    if (/^(https?:|mailto:|#)/.test(target)) continue;
    const clean = target.split("#")[0];
    if (!clean) continue;
    const resolved = path.resolve(path.dirname(file), clean);
    if (!(await exists(resolved))) errors.push(`Broken markdown link in ${rel(file)}: ${target}`);
  }
}

for (const jsonFile of (await walk(path.join(plugin, "fixtures"))).filter((file) => file.endsWith(".json"))) {
  await readJson(jsonFile);
}

const skillText = await readFile(path.join(plugin, "skills/fhir-validation/SKILL.md"), "utf8");
const skillLines = skillText.trim().split(/\r?\n/).length;
if (skillLines > 90) errors.push(`SKILL.md should stay concise; found ${skillLines} lines.`);

try {
  const script = path.join(plugin, "skills/fhir-validation/scripts/detect-fhir-project.mjs");
  const scriptStat = await stat(script);
  if (!scriptStat.isFile()) errors.push("Detector script is not a file.");
} catch (error) {
  errors.push(error.message);
}

if (errors.length) {
  console.error(errors.map((error) => `- ${error}`).join("\n"));
  process.exit(1);
}

console.log("Smoke test passed.");
