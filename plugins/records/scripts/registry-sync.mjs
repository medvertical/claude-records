#!/usr/bin/env node
// Builds the ClaudeRegistry re-sync branch that previously required a manual
// clone/rsync/verify procedure on every release (done by hand for v0.8.2 and
// v0.8.3 within ten days of each other). Produces a branch on the user's fork
// clone whose vendored plugins/records is byte-identical to this repository,
// with the marketplace entry and verified.json regenerated via the registry's
// own verifier. Pushing and opening the PR stay manual — publishing is a
// human decision.
//
// Usage:
//   node plugins/records/scripts/registry-sync.mjs [work-dir]
//
// Environment:
//   RECORDS_REGISTRY_FORK      default git@github.com:sheydin/marketplace.git
//   RECORDS_REGISTRY_UPSTREAM  default git@github.com:ClaudeRegistry/marketplace.git
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../skills/fhir-validation/scripts/lib/process-runner.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(scriptDir, "../../..");
const plugin = path.join(repo, "plugins/records");
const fork = process.env.RECORDS_REGISTRY_FORK || "git@github.com:sheydin/marketplace.git";
const upstream = process.env.RECORDS_REGISTRY_UPSTREAM || "git@github.com:ClaudeRegistry/marketplace.git";

const fail = (message) => {
  console.error(message);
  process.exit(1);
};

const version = JSON.parse(await readFile(path.join(plugin, ".claude-plugin/plugin.json"), "utf8")).version;
const branch = `records-v${version}`;
const work = process.argv[2]
  ? path.resolve(process.argv[2])
  : await mkdtemp(path.join(os.tmpdir(), "records-registry-sync-"));
const clone = path.join(work, "marketplace");

const sh = (cmd, args, opts = {}) => {
  const result = runProcess(cmd, args, { timeout: 180_000, ...opts });
  if (result.status !== 0) fail(`${cmd} ${args.join(" ")} failed:\n${result.stderr || result.stdout}`);
  return result;
};

console.log(`Cloning fork ${fork}…`);
sh("git", ["clone", "--quiet", fork, clone]);
sh("git", ["remote", "add", "upstream", upstream], { cwd: clone });
sh("git", ["fetch", "--quiet", "upstream", "main"], { cwd: clone });
sh("git", ["checkout", "--quiet", "-B", branch, "upstream/main"], { cwd: clone });

console.log(`Vendoring plugins/records at v${version}…`);
sh("rsync", ["-a", "--delete", "--exclude", ".git", "--exclude", "node_modules", `${plugin}/`, path.join(clone, "plugins/records/")]);
const diff = runProcess("diff", ["-r", plugin, path.join(clone, "plugins/records")], { timeout: 60_000 });
if (diff.status !== 0) fail(`Vendored copy differs from source:\n${diff.stdout}`);

const manifestPath = path.join(clone, ".claude-plugin/marketplace.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
const entry = manifest.plugins.find((candidate) => candidate.name === "records");
if (!entry) fail("No records entry in the registry marketplace.json; submit the plugin before syncing.");
const pluginManifest = JSON.parse(await readFile(path.join(plugin, ".claude-plugin/plugin.json"), "utf8"));
entry.version = pluginManifest.version;
entry.description = pluginManifest.description;
entry.keywords = pluginManifest.keywords;
await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

console.log("Running the registry verifier…");
const standalone = runProcess(process.execPath, ["scripts/verify-plugins.mjs", "plugins/records"], { cwd: clone, timeout: 300_000 });
if (standalone.status !== 0) fail(`Registry verifier failed for records:\n${standalone.stdout}\n${standalone.stderr}`);
sh(process.execPath, ["scripts/verify-plugins.mjs"], { cwd: clone, timeout: 300_000 });

sh("git", ["add", "-A"], { cwd: clone });
sh("git", ["commit", "--quiet", "-m", `chore(records): re-sync vendored copy to v${version}`], { cwd: clone });

console.log(`
Re-sync branch ready: ${clone} @ ${branch}
Vendored copy verified byte-identical; registry verifier passed.

Next steps (run manually — pushing publishes):
  git -C ${clone} push -u origin ${branch}
  then open the PR against ClaudeRegistry/marketplace main.`);
