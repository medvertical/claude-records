#!/usr/bin/env node
// Automates the mechanical release chain so no step can be skipped:
// verify clean main → full check suite → annotated-free tag on HEAD →
// print the exact push and GitHub-release commands. Created after
// v0.8.2/v0.8.3 shipped from main without tags or GitHub releases and
// /releases/latest pointed at v0.8.1 for three weeks.
//
// Usage:
//   node plugins/records/scripts/release.mjs           # tag + print next steps
//   node plugins/records/scripts/release.mjs --dry-run # verify only, no tag
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runProcess } from "../skills/fhir-validation/scripts/lib/process-runner.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(scriptDir, "../../..");
const dryRun = process.argv.includes("--dry-run");
const failures = [];

const git = (args, timeout = 15_000) => runProcess("git", args, { cwd: repo, timeout });

const pkg = JSON.parse(await readFile(path.join(repo, "package.json"), "utf8"));
const version = pkg.version;
const tag = `v${version}`;

const branch = git(["rev-parse", "--abbrev-ref", "HEAD"]).stdout.trim();
if (branch !== "main") failures.push(`Releases are cut from main; current branch is ${branch}.`);

const dirty = git(["status", "--porcelain"]).stdout.trim();
if (dirty) failures.push("Working tree is not clean; commit or stash before releasing.");

const tagExists = git(["tag", "--list", tag]).stdout.trim() === tag;
if (tagExists) failures.push(`Tag ${tag} already exists; bump the version before releasing again.`);

if (failures.length === 0) {
  console.log(`Running the full check suite for ${tag}…`);
  const check = runProcess("npm", ["run", "check"], { cwd: repo, timeout: 600_000 });
  if (check.status !== 0) {
    failures.push(`npm run check failed:\n${(check.stderr || check.stdout || "").slice(-2000)}`);
  }
}

if (failures.length) {
  console.error(failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

if (dryRun) {
  console.log(`Dry run passed for ${tag}; no tag created.`);
  process.exit(0);
}

const tagged = git(["tag", tag]);
if (tagged.status !== 0) {
  console.error(`Failed to create tag ${tag}: ${tagged.stderr || tagged.stdout}`);
  process.exit(1);
}

const notes = `plugins/records/eval-results/${tag}.md`;
console.log(`Tagged ${tag} on ${git(["rev-parse", "--short", "HEAD"]).stdout.trim()}.

Next steps (run manually — pushing publishes):
  git push origin main ${tag}
  gh release create ${tag} --title "Records Agent Tools ${tag}" --notes-file ${notes} --latest

If gh is unauthenticated, create the release at:
  https://github.com/medvertical/records-agent-tools/releases/new?tag=${tag}`);
