# Records FHIR Validation for Claude Code

Claude Code skill for validating FHIR resources with Records.

## Install

From a published marketplace repository:

```bash
claude plugin marketplace add medvertical/claude-records
claude plugin install records-fhir-validation@records
```

For local development from the Records repository:

```bash
claude plugin marketplace add .
claude plugin install records-fhir-validation@records
```

## What It Does

The skill guides Claude through four validation modes:

1. Records MCP tools, when available.
2. A user-configured Records API via `RECORDS_API_URL`.
3. The local `records validate-file` CLI.
4. A clearly labeled structural fallback when no Records runtime is available.

The local CLI fallback uses Records' packaged FHIR R4 structural schema for resource types, required fields, unknown fields, cardinality, primitive types, choice fields, and simple backbone children. It does not replace profile, terminology, invariant, reference, metadata, advisor-rule, anomaly, or evidence-report validation.

## Why Records

Records is designed as an agent-friendly FHIR quality oracle:

- Local-first Node/TypeScript workflow, with no JVM required for the CLI fallback.
- Structured issue data for Claude to group, explain, patch, and revalidate.
- Optional MCP tools for direct agent calls instead of parsing shell output.
- Optional hosted Records API for full validation and evidence workflows.

## Privacy

The skill is local-first. It instructs Claude not to send clinical or patient data to external services unless the user has explicitly configured that service or clearly consented.

See [PRIVACY.md](./PRIVACY.md) for the data-handling policy.

## Development Test

From the Records repository:

```bash
npm run test:claude-plugin
```

This validates the plugin manifests, skill content, and local Records CLI path.
