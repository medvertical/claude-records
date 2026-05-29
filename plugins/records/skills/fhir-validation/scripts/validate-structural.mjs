#!/usr/bin/env node
// Structural fallback validator for FHIR R4 JSON.
//
// Scope (honest, like the HL7 reference validator's structural pass only):
//   - base resource shape: object, string resourceType, id format
//   - no JSON nulls or empty arrays (invalid in FHIR JSON)
//   - for covered resource types: required (min-cardinality) elements,
//     unknown top-level elements, choice[x] exclusivity, required code enums
//
// NOT covered: profiles, slicing, terminology/ValueSet binding, FHIRPath
// invariants, references, or package/canonical resolution. Use a profile-aware
// runtime (Records, IG Publisher, HAPI, Firely) for those.
//
// Output: a FHIR OperationOutcome plus a summary. Exit code 0 = no errors,
// 1 = at least one error-severity issue, 2 = input could not be parsed.
import { readFile } from "node:fs/promises";
import { resourceSchemas, coveredResourceTypes } from "./lib/r4-structural-schema.mjs";

const idPattern = /^[A-Za-z0-9\-.]{1,64}$/;

function readStdin() {
  return new Promise((resolve) => {
    let data = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => { data += chunk; });
    process.stdin.on("end", () => resolve(data));
  });
}

function issue(severity, code, expression, text) {
  return { severity, code, expression: [expression], details: { text } };
}

// Detect JSON nulls and empty arrays anywhere in the resource (both invalid in
// FHIR JSON). Builds a FHIRPath-style location for the issue.
function checkJsonShape(node, pathPrefix, issues) {
  if (Array.isArray(node)) {
    if (node.length === 0) {
      issues.push(issue("error", "value", pathPrefix, "Empty arrays are not allowed in FHIR JSON."));
      return;
    }
    node.forEach((item, index) => {
      if (item === null) {
        // null is only valid as a primitive-array placeholder; flag as info.
        issues.push(issue("information", "value", `${pathPrefix}[${index}]`, "Array contains a null; only valid as a primitive-extension placeholder."));
      } else {
        checkJsonShape(item, `${pathPrefix}[${index}]`, issues);
      }
    });
    return;
  }
  if (node && typeof node === "object") {
    for (const [key, value] of Object.entries(node)) {
      const childPath = `${pathPrefix}.${key}`;
      if (value === null) {
        issues.push(issue("error", "value", childPath, "Null values are not allowed in FHIR JSON."));
        continue;
      }
      checkJsonShape(value, childPath, issues);
    }
  }
}

function validateResource(resource, rootPath, issues) {
  if (resource === null || typeof resource !== "object" || Array.isArray(resource)) {
    issues.push(issue("error", "structure", rootPath, "Resource must be a JSON object."));
    return;
  }
  const type = resource.resourceType;
  if (typeof type !== "string" || !type) {
    issues.push(issue("error", "structure", `${rootPath}.resourceType`, "Missing or non-string resourceType."));
    return;
  }
  const base = `${rootPath === "$" ? type : rootPath}`;

  if (resource.id !== undefined) {
    if (typeof resource.id !== "string" || !idPattern.test(resource.id)) {
      issues.push(issue("error", "value", `${base}.id`, "id must be a string matching [A-Za-z0-9-.]{1,64}."));
    }
  }

  checkJsonShape(resource, base, issues);

  const schema = resourceSchemas[type];
  if (!schema) {
    issues.push(issue("information", "incomplete", base, `No structural schema embedded for ${type}; only base-resource checks ran. Use a profile-aware runtime for full validation.`));
  } else {
    validateAgainstSchema(resource, type, base, schema, issues);
  }

  // Recurse into Bundle entries for top-level structural checks.
  if (type === "Bundle" && Array.isArray(resource.entry)) {
    resource.entry.forEach((entry, index) => {
      if (entry && typeof entry === "object" && entry.resource) {
        validateResource(entry.resource, `${base}.entry[${index}].resource`, issues);
      }
    });
  }
}

function validateAgainstSchema(resource, type, base, schema, issues) {
  const allowed = new Set(schema.elements);
  // Required (min cardinality) elements.
  for (const element of schema.required) {
    if (resource[element] === undefined) {
      issues.push(issue("error", "required", `${base}.${element}`, `Missing required element ${element}.`));
    }
  }
  // Unknown top-level elements.
  for (const key of Object.keys(resource)) {
    if (key === "resourceType") continue;
    if (key.startsWith("_")) {
      // Primitive-extension sibling: valid only if the base element is known.
      if (!allowed.has(key.slice(1))) {
        issues.push(issue("error", "structure", `${base}.${key}`, `Unknown primitive-extension sibling ${key}.`));
      }
      continue;
    }
    if (!allowed.has(key)) {
      issues.push(issue("error", "structure", `${base}.${key}`, `Element ${key} is not part of ${type} (structural schema).`));
    }
  }
  // Choice[x] exclusivity: at most one concrete property per choice base.
  const choiceGroups = {};
  for (const element of schema.elements) {
    const match = element.match(/^([a-z]+)([A-Z][A-Za-z0-9]*)$/);
    if (!match) continue;
    const lowerBase = match[1];
    if (schema.elements.includes(`${lowerBase}DateTime`) || schema.elements.filter((e) => e.startsWith(lowerBase) && /^[a-z]+[A-Z]/.test(e)).length > 1) {
      if (allowed.has(element) && resource[element] !== undefined) {
        (choiceGroups[lowerBase] ||= []).push(element);
      }
    }
  }
  for (const [lowerBase, present] of Object.entries(choiceGroups)) {
    if (present.length > 1) {
      issues.push(issue("error", "structure", `${base}.${lowerBase}[x]`, `Only one choice element allowed; found ${present.join(", ")}.`));
    }
  }
  // Required-binding code enums.
  for (const [element, allowedCodes] of Object.entries(schema.codes || {})) {
    const value = resource[element];
    if (value === undefined) continue;
    if (typeof value !== "string") {
      issues.push(issue("error", "value", `${base}.${element}`, `${element} must be a code string, found ${typeof value}.`));
    } else if (!allowedCodes.includes(value)) {
      issues.push(issue("error", "code-invalid", `${base}.${element}`, `${element} value '${value}' is not in the required value set.`));
    }
  }
}

const file = process.argv[2] && !process.argv[2].startsWith("-") ? process.argv[2] : null;
const text = file ? await readFile(file, "utf8") : await readStdin();

let resource;
try {
  resource = JSON.parse(text);
} catch (error) {
  console.error(`Invalid JSON: ${error.message}`);
  process.exit(2);
}

const issues = [];
validateResource(resource, "$", issues);

const summary = issues.reduce(
  (acc, item) => {
    acc[item.severity] = (acc[item.severity] || 0) + 1;
    return acc;
  },
  { error: 0, warning: 0, information: 0 },
);

const output = {
  schemaVersion: 1,
  mode: "structural-fallback",
  scope: "Base shape, required elements, unknown elements, choice[x] exclusivity, and required code enums only. Not profile-, terminology-, invariant-, or reference-aware.",
  file: file || "<stdin>",
  resourceType: typeof resource?.resourceType === "string" ? resource.resourceType : null,
  coveredResourceTypes,
  summary,
  operationOutcome: {
    resourceType: "OperationOutcome",
    issue: issues.length ? issues : [issue("information", "informational", "$", "No structural issues found.")],
  },
};

console.log(JSON.stringify(output, null, 2));
process.exit(summary.error > 0 ? 1 : 0);
