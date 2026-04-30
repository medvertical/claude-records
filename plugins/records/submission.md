# Claude Plugin Directory Submission

Use this content for the official Claude Code Plugin Directory submission form.

## Plugin

Records

## Repository

https://github.com/medvertical/claude-records

## Install

```bash
claude plugin marketplace add medvertical/claude-records
claude plugin install records@medvertical
```

## Invocation

```text
/records:fhir-validation validate ./examples
```

## Short Description

Local-first FHIR validation and data-quality workflow skill for Claude Code.

## Long Description

Records helps FHIR developers, IG authors, and AI agents validate FHIR JSON, explain validation issues, add CI checks, and run validate-patch-revalidate workflows with Claude Code.

The `fhir-validation` skill is local-first and privacy-oriented. It uses Records MCP tools when available, a user-configured Records API when explicitly configured, the local `records validate-file` CLI when available, or a clearly labeled structural fallback when no Records runtime is available.

Unlike validator-specific runbooks, Records positions Claude around a data-quality workflow: validate, explain, patch safe mechanical issues, revalidate, and escalate domain-dependent clinical values instead of inventing placeholders.

## Category

development

## Keywords

FHIR, HL7, Claude Code, healthcare interoperability, validation, Records, MCP, data quality, Implementation Guide, IG authoring

## Privacy

The plugin is local-first. It instructs Claude not to send clinical or patient data to external services unless the user explicitly configured that service or clearly consented. See `PRIVACY.md`.

## License

MIT

## Release

https://github.com/medvertical/claude-records/releases/latest
