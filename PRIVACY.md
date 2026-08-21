# Privacy and Data Handling

The Records FHIR Validation skill is local-first.

## Default Behavior

By default, the skill instructs the coding agent to use local project files, local Records CLI commands, or locally configured MCP tools. It must not send clinical or patient data to external services unless the user has explicitly configured that service or clearly consented in the current workflow.

## Hosted API Mode

Hosted validation is opt-in. The skill uses a Records API only when `RECORDS_API_URL` is configured by the user or project. Interactive plugin authentication uses the user-managed `RECORDS_AUTH_TOKEN`. A CI workflow may instead name its secret `RECORDS_API_KEY` and pass it explicitly to the Records CLI `--auth-token` option; the plugin does not treat that CI variable as its interactive token.

## Structural Fallback

When no Records runtime is available, the coding agent may perform a local structural fallback by parsing JSON and checking obvious FHIR shape issues. This fallback is not full validation and does not require network access.

## Recommended Use

For real patient data, prefer one of:

- Local Records CLI validation.
- Local Records MCP validation.
- A self-hosted Records API inside the user's approved environment.

Do not paste real patient data into public issue trackers, public prompts, or hosted services unless your organization has approved that workflow.

## Redacted Summaries

The plugin includes `skills/fhir-validation/scripts/redact-fhir-summary.mjs` to summarize Patient-like resources, Bundles, identifiers, references, and OperationOutcomes without printing full identifiers or demographics. Use it before sharing validation context that may contain PHI.
