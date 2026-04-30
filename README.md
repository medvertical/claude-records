<p align="center">
  <img src="./assets/records-signet.svg" alt="Records" width="96" height="96">
</p>

# Records for Claude Code

FHIR validation and data-quality workflow skills for Claude Code.

Records helps FHIR developers, IG authors, and AI agents validate FHIR JSON, explain validation issues, add CI checks, and run validate-patch-revalidate workflows without sending patient data to an external service by default.

## Install

```bash
claude plugin marketplace add medvertical/claude-records
claude plugin install records@medvertical
```

Invoke the FHIR validation skill:

```text
/records:fhir-validation validate ./examples
```

## Skills

### `/records:fhir-validation`

Validate FHIR resources, explain issues, add CI checks, and guide safe repair loops.

Example prompts:

```text
/records:fhir-validation validate patient.json
/records:fhir-validation { "resourceType": "Observation" }
/records:fhir-validation explain this OperationOutcome: ...
/records:fhir-validation add GitHub Actions validation for ./examples
/records:fhir-validation validate this IG folder
```

## What It Does

The FHIR validation skill guides Claude through four modes:

1. **Records MCP tools**, when available.
2. **Records API**, when `RECORDS_API_URL` is configured.
3. **Records CLI**, using `records validate-file`.
4. **Structural fallback**, clearly labeled when no Records runtime is available.

The local CLI fallback uses Records' packaged FHIR R4 structural schema for resource types, required fields, unknown fields, cardinality, primitive types, choice fields, and simple backbone children. It does not replace profile, terminology, invariant, reference, metadata, advisor-rule, anomaly, or evidence-report validation.

## Repository Scope

This repository is plugin/skill-only. It contains the Claude Code marketplace entry, the `records` plugin, the `fhir-validation` skill, plugin commands, fixtures, and local plugin tests.

The Records Engine, CLI, API, and MCP server live in the Records main repository. This plugin can use those runtimes when they are already installed or configured, but this repository does not contain their implementation.

## Why Records

- **Local-first** Node/TypeScript workflow, with no JVM required for local structural checks.
- **Privacy-first** instructions: do not send clinical or patient data externally unless explicitly configured or consented.
- **Agent repair loop**: validate, group issues, patch safe mechanical problems, revalidate.
- **MCP-ready**: direct agent tool calls when Records MCP is configured.
- **Data-quality scope** beyond base conformance: advisor rules, anomaly detection, evidence reports, run comparison, and dataset quality workflows through full Records runtimes.

## Privacy

See [PRIVACY.md](./PRIVACY.md) for the data-handling policy.

## Development

Run plugin checks from this `claude-records` repository:

```bash
npx --yes @anthropic-ai/claude-code plugin validate .
node plugins/records/scripts/smoke-test.mjs
```

If `package.json` is present, `npm test` runs the same smoke test. Prompt-level release checks live in [plugins/records/evals.md](./plugins/records/evals.md). Results are in [plugins/records/eval-results/](./plugins/records/eval-results/).
