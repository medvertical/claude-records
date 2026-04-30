#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";

const repo = path.resolve(new URL("../../..", import.meta.url).pathname);
const plugin = path.join(repo, "plugins/records");
const failures = [];

function runJson(script, args, input = null) {
  const result = spawnSync(process.execPath, [script, ...args], {
    cwd: repo,
    input,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    failures.push(`${path.relative(repo, script)} failed: ${result.stderr || result.stdout}`);
    return null;
  }
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    failures.push(`${path.relative(repo, script)} output was not JSON: ${error.message}`);
    return null;
  }
}

const detector = path.join(plugin, "skills/fhir-validation/scripts/detect-fhir-project.mjs");
const mapper = path.join(plugin, "skills/fhir-validation/scripts/map-generated-to-fsh.mjs");
const redactor = path.join(plugin, "skills/fhir-validation/scripts/redact-fhir-summary.mjs");
const miniIg = path.join(plugin, "fixtures/mini-ig");

const detection = runJson(detector, [miniIg]);
if (detection) {
  const expected = [
    detection.projectType === "fsh-ig",
    detection.sourceDirs.includes("input/fsh"),
    detection.generatedDirs.includes("fsh-generated/resources"),
    detection.packageDependencies.sushi["hl7.fhir.r4.core"] === "4.0.1",
    detection.resourceInventory.metaProfiles["https://example.org/fhir/records-mini/StructureDefinition/records-mini-observation"] === 1,
  ];
  if (expected.some((value) => !value)) failures.push("Detector fixture expectations failed.");
}

const mapping = runJson(mapper, [
  path.join(miniIg, "fsh-generated/resources/Observation-MiniObservationMissingCode.json"),
  miniIg,
]);
if (mapping) {
  if (mapping.resource.resourceType !== "Observation") failures.push("Mapper did not read generated Observation.");
  if (!mapping.candidates[0]?.reasons?.length) failures.push("Mapper did not explain candidate reasons.");
}

const summary = runJson(redactor, [path.join(plugin, "fixtures/patient-with-phi.json")]);
if (summary) {
  if (summary.id !== "[redacted]") failures.push("Redactor did not redact Patient id.");
  if (JSON.stringify(summary).includes("Jane")) failures.push("Redactor leaked patient name.");
}

const outcome = runJson(redactor, [path.join(plugin, "fixtures/operationoutcome-required.json")]);
if (outcome) {
  if (outcome.resourceType !== "OperationOutcome" || outcome.issueCount !== 2) failures.push("Redactor did not summarize OperationOutcome.");
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Fixture evals passed.");
