# Structural Fallback Validation

Use `scripts/validate-structural.mjs` only when no Records runtime and no
profile-aware validator (Records CLI/API/MCP, SUSHI, IG Publisher, Firely
Terminal, HAPI, Java validator) is available. Always label the result as
structural fallback.

```bash
node "${CLAUDE_PLUGIN_ROOT:-.}/skills/fhir-validation/scripts/validate-structural.mjs" <resource.json>
# or pipe JSON on stdin:
cat resource.json | node "${CLAUDE_PLUGIN_ROOT:-.}/skills/fhir-validation/scripts/validate-structural.mjs"
```

Output is a FHIR `OperationOutcome` plus a summary. Exit code `0` means no
error-severity issues, `1` means at least one error, `2` means the input could
not be parsed as JSON. Pipe issues into
`scripts/explain-operationoutcome.mjs` for fixability guidance, and resolve
`issue.expression` to a JSON Pointer with `scripts/map-fhir-expression.mjs`.

## What it checks

- Base resource shape: JSON object, string `resourceType`, `id` format.
- No JSON `null` values or empty arrays (both invalid in FHIR JSON).
- For covered resource types (Patient, Observation, Bundle): required
  (min-cardinality) elements, unknown top-level elements, `choice[x]`
  exclusivity, and required-binding code enums (such as `Observation.status`).
- Bundle entries are checked with the same base- and schema-level rules.

## What it does NOT check

It does not load StructureDefinitions, packages, or terminology, so it cannot
validate profiles, slicing, ValueSet/CodeSystem bindings, FHIRPath invariants,
references, or canonicals. Resource types without an embedded schema receive
only the base-resource checks and an `incomplete` informational issue. For full
conformance, run a profile-aware runtime with the relevant FHIR/IG packages.

The embedded schema lives in `scripts/lib/r4-structural-schema.mjs`; extend it
there to cover more resource types or code bindings.
