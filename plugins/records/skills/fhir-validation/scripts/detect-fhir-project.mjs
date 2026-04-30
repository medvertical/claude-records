#!/usr/bin/env node
import { access, readdir, readFile, stat } from "node:fs/promises";
import { constants } from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const root = path.resolve(process.argv[2] || process.cwd());

async function exists(file) {
  try {
    await access(path.join(root, file), constants.F_OK);
    return true;
  } catch {
    return false;
  }
}

async function isDir(file) {
  try {
    return (await stat(path.join(root, file))).isDirectory();
  } catch {
    return false;
  }
}

async function listFiles(dir, depth = 2) {
  const base = path.join(root, dir);
  const out = [];
  async function walk(current, remaining) {
    if (remaining < 0) return;
    let entries = [];
    try {
      entries = await readdir(current, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      const full = path.join(current, entry.name);
      const rel = path.relative(root, full);
      if (entry.isDirectory()) {
        await walk(full, remaining - 1);
      } else {
        out.push(rel);
      }
    }
  }
  await walk(base, depth);
  return out.sort();
}

function commandAvailable(command, args = ["--version"]) {
  const result = spawnSync(command, args, { encoding: "utf8", timeout: 3000 });
  return {
    available: result.status === 0 || result.status === null || Boolean(result.stdout || result.stderr),
    command,
    version: String(result.stdout || result.stderr || "").split(/\r?\n/).find(Boolean) || null,
  };
}

async function packageScripts() {
  if (!(await exists("package.json"))) return {};
  try {
    const pkg = JSON.parse(await readFile(path.join(root, "package.json"), "utf8"));
    return pkg.scripts || {};
  } catch {
    return {};
  }
}

const sourceDirs = [];
for (const dir of ["input/fsh", "input/resources", "examples", "fixtures", "src", "test"]) {
  if (await isDir(dir)) sourceDirs.push(dir);
}

const generatedDirs = [];
for (const dir of ["fsh-generated/resources", "fsh-generated", "output", "package"]) {
  if (await isDir(dir)) generatedDirs.push(dir);
}

const workflowFiles = [];
for (const file of ["sushi-config.yaml", "sushi-config.yml", "ig.ini", "package.json", ".rules.yaml", ".rules.yml"]) {
  if (await exists(file)) workflowFiles.push(file);
}
if (await isDir(".github/workflows")) workflowFiles.push(...(await listFiles(".github/workflows", 1)));

const scripts = await packageScripts();
const scriptNames = Object.keys(scripts);
const availableRuntimes = {
  recordsApi: Boolean(process.env.RECORDS_API_URL),
  recordsCli: commandAvailable("records"),
  localRecordsCliPackage: await exists("cli/package.json"),
  sushi: commandAvailable("sushi"),
  npxSushiScript: scriptNames.some((name) => /sushi|fsh/i.test(`${name} ${scripts[name]}`)),
  java: commandAvailable("java", ["-version"]),
  javaValidatorJar: (await listFiles(".", 2)).filter((file) => /validator.*\.jar$/i.test(file)),
  firelyTerminal: commandAvailable("fhir"),
  hapi: commandAvailable("hapi-fhir-cli"),
  packageScripts: scripts,
};

let projectType = "unknown";
if (workflowFiles.some((file) => file.startsWith("sushi-config")) || sourceDirs.includes("input/fsh")) {
  projectType = "fsh-ig";
} else if (workflowFiles.includes("ig.ini")) {
  projectType = "ig";
} else if (sourceDirs.some((dir) => ["input/resources", "examples", "fixtures"].includes(dir))) {
  projectType = "fhir-resources";
}

const recommendedOrder = [];
if (sourceDirs.includes("input/fsh")) {
  recommendedOrder.push("Inspect input/fsh and sushi-config.yaml before editing generated resources.");
  if (availableRuntimes.sushi.available || availableRuntimes.npxSushiScript) {
    recommendedOrder.push("Run the repository SUSHI script or sushi build after FSH changes.");
  } else {
    recommendedOrder.push("SUSHI sources exist, but no local SUSHI runtime was detected; ask before installing.");
  }
}
if (availableRuntimes.recordsCli.available) {
  recommendedOrder.push("Run records validate-file on source or generated JSON directories.");
} else if (availableRuntimes.recordsApi) {
  recommendedOrder.push("Use RECORDS_API_URL only after confirming privacy consent for the selected resources.");
} else {
  recommendedOrder.push("Use structural fallback only and label it as not profile-aware.");
}
if (workflowFiles.includes("ig.ini") && availableRuntimes.java.available) {
  recommendedOrder.push("Run configured IG Publisher or Java validator for profile-aware IG validation when requested.");
}
if (availableRuntimes.firelyTerminal.available || availableRuntimes.hapi.available) {
  recommendedOrder.push("Use Firely Terminal or HAPI as a configured cross-check, not as an unannounced replacement.");
}

const privacyWarnings = [];
if (availableRuntimes.recordsApi) {
  privacyWarnings.push("RECORDS_API_URL is set; confirm consent before sending PHI or full patient resources to the API.");
}
if (sourceDirs.includes("examples") || sourceDirs.includes("fixtures") || sourceDirs.includes("input/resources")) {
  privacyWarnings.push("FHIR resource directories may contain PHI; summarize minimally and prefer local validation.");
}
if (workflowFiles.some((file) => file.includes(".github/workflows"))) {
  privacyWarnings.push("CI workflows may publish logs; avoid printing complete Patient resources or secrets.");
}

const result = {
  root,
  projectType,
  sourceDirs,
  generatedDirs,
  workflowFiles,
  availableRuntimes,
  recommendedOrder,
  privacyWarnings,
};

console.log(JSON.stringify(result, null, 2));
