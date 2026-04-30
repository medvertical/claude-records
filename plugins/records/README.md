<p align="center">
  <img src="./assets/records-signet.svg" alt="Records" width="96" height="96">
</p>

# Records for Claude Code

FHIR validation and data-quality workflow skills for Claude Code.

Records helps FHIR developers, IG authors, and AI agents validate FHIR JSON, explain validation issues, add CI checks, and run validate-patch-revalidate workflows without sending patient data to an external service by default.

## Install

```bash
claude plugin marketplace add medvertical/claude-records
claude plugin install records@records
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

## Why Records

- **Local-first** Node/TypeScript workflow, with no JVM required for local structural checks.
- **Privacy-first** instructions: do not send clinical or patient data externally unless explicitly configured or consented.
- **Agent repair loop**: validate, group issues, patch safe mechanical problems, revalidate.
- **MCP-ready**: direct agent tool calls when Records MCP is configured.
- **Data-quality scope** beyond base conformance: advisor rules, anomaly detection, evidence reports, run comparison, and dataset quality workflows through full Records runtimes.

## Compatibility

The old plugin invocation is deprecated:

```text
/records-fhir-validation:records-fhir-validation
```

Use this instead:

```text
/records:fhir-validation
```

## Privacy

See [PRIVACY.md](./PRIVACY.md) for the data-handling policy.

## Development Test

From the Records repository:

```bash
npm run test:claude-plugin
```

Prompt-level release checks live in [evals.md](./evals.md). Results are in [eval-results/](./eval-results/).
