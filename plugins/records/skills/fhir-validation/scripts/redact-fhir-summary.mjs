#!/usr/bin/env node
import { readFile } from "node:fs/promises";

const inputPath = process.argv[2];
const text = inputPath ? await readFile(inputPath, "utf8") : await new Promise((resolve) => {
  let data = "";
  process.stdin.setEncoding("utf8");
  process.stdin.on("data", (chunk) => { data += chunk; });
  process.stdin.on("end", () => resolve(data));
});

function redactValue(key, value) {
  const sensitiveKeys = new Set(["id", "value", "text", "display", "family", "given", "birthDate", "line", "city", "postalCode", "phone", "email"]);
  if (sensitiveKeys.has(key) && typeof value !== "object") return "[redacted]";
  return value;
}

function summarize(resource) {
  const summary = {
    resourceType: resource.resourceType || null,
    id: resource.id ? "[redacted]" : null,
    metaProfiles: Array.isArray(resource.meta?.profile) ? resource.meta.profile : [],
    references: [],
    issueCount: Array.isArray(resource.issue) ? resource.issue.length : undefined,
  };
  const references = new Set();
  JSON.stringify(resource, (key, value) => {
    if (key === "reference" && typeof value === "string") references.add(value.replace(/\/[^/]+$/, "/[redacted]"));
    return redactValue(key, value);
  });
  summary.references = [...references].sort();
  return summary;
}

let parsed;
try {
  parsed = JSON.parse(text);
} catch (error) {
  console.error(`Invalid JSON: ${error.message}`);
  process.exit(1);
}

if (parsed.resourceType === "Bundle" && Array.isArray(parsed.entry)) {
  console.log(JSON.stringify({
    resourceType: "Bundle",
    id: parsed.id ? "[redacted]" : null,
    entryCount: parsed.entry.length,
    resourceTypes: parsed.entry.reduce((acc, entry) => {
      const type = entry?.resource?.resourceType || "unknown";
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {}),
  }, null, 2));
} else {
  console.log(JSON.stringify(summarize(parsed), null, 2));
}
