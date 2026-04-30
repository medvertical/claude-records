---
name: fhir-validation
description: This skill should be used when the user asks to validate FHIR resources, check FHIR JSON, review Implementation Guide examples, validate AI-created FHIR output, explain validation issues, generate CI validation steps, or run a validate-patch-revalidate loop with Records.
version: 0.2.0
argument-hint: "[file-or-directory-or-json]"
allowed-tools: [Read, Glob, Grep, Bash, Edit, Write, MultiEdit]
---

# Records FHIR Validation

Validate FHIR resources with Records. Prefer local or user-configured execution. Never send clinical or patient data to an external service unless the user has explicitly configured that service or has clearly consented.

## Arguments

The user invoked this with: $ARGUMENTS

Treat arguments as the file, directory, JSON resource, FHIR URL, or validation goal to inspect. If no argument is provided, infer the target from the user's message or ask one concise question only when there is no safe default.

## Mode Selection

Choose the first available mode:

1. **Records MCP mode**: If Records MCP tools are available, use them first. For a single resource, call `validate_resource`; for an issue code, call `explain_issue`; use `get_quality_score` and `compare_runs` when requested.
2. **Hosted API mode**: If `RECORDS_API_URL` is set, use the Records API. For the Records CLI, pass auth with `--auth-token "$RECORDS_AUTH_TOKEN"` or map `RECORDS_API_KEY` to `--auth-token "$RECORDS_API_KEY"`. For direct `curl`, include `Authorization: Bearer $RECORDS_API_KEY` only when `RECORDS_API_KEY` is set. Do not invent endpoints; inspect local docs or API code when working inside the Records repo.
3. **Records CLI mode**: If the `records` CLI is available, run `records validate-file <target>`. Inside a Records checkout where the CLI is not built globally, run it through the CLI package with `npm --prefix cli run dev -- validate-file <target>`.
4. **Structural fallback mode**: If no Records runtime is available, parse JSON locally and perform a minimal structural check only. Be explicit that this is not profile-aware validation.

## Input Detection

Accept any of:

- A `*.json` file containing a FHIR resource or Bundle.
- A `*.ndjson` file containing one FHIR resource per line.
- A directory; scan recursively for `*.json` resources.
- Pasted JSON; write it to a temporary file only if needed, then remove it.
- A FHIR server URL or resource URL; fetch only with user consent if it may expose private data.

Use `meta.profile[]` when present. If the user names a profile explicitly, pass that profile to the available Records mode when supported.

## Agent Repair Loop

When the user asks Claude to fix or generate FHIR:

1. Validate the resource before editing when possible.
2. Group issues by severity and aspect.
3. Fix errors before warnings.
4. Prefer small, targeted edits that preserve clinical meaning.
5. Revalidate after each meaningful patch.
6. Stop when validation passes or when remaining issues need domain input, missing profiles, or terminology authority.

Do not silently change codes, identifiers, dates, references, or clinical content just to satisfy validation. Ask for user or domain authority when the correct value is not inferable from the resource or project context.

## Common Workflows

### Validate a file or directory

Use Records CLI mode when possible. Prefer JSON output when the result will be parsed or summarized:

```bash
records --json validate-file <target> --format json
```

Inside a Records checkout:

```bash
npm --prefix cli run dev -- --json validate-file <target> --format json
```

If output says `mode: "local"`, call it local structural validation. Do not call it profile-aware validation.

### Validate pasted JSON

If the user pasted JSON, parse it first. If a local Records CLI is available, write the JSON to a temporary file, validate it, and remove the file. If no CLI/runtime is available, use structural fallback and explicitly say full Records validation was not run.

For an `Observation`, missing `status` or `code` is an error-level structural issue. Do not invent clinical codes or status values unless the user gave enough context.

### Fix an invalid resource

Use this sequence:

1. Validate.
2. Patch only mechanical or clearly inferable structural problems.
3. Revalidate.
4. Report before/after issue counts.

Do not make semantic clinical changes, such as replacing codes, changing dates, or redirecting references, unless the correct value is present in the project or the user supplied it.

Do not add placeholder clinical fields just to make validation pass. In particular:

- Do not add `CodeableConcept.text`, fake LOINC/SNOMED codes, or `<placeholder>` values for missing clinical concepts.
- Do not replace invalid status values with `unknown`, `final`, or another code unless the user or source data supports that value.
- Do not report "after: 0 errors" if the only way to get there was a placeholder or clinically meaningless value.

If a required field needs domain input, stop after any safe mechanical fixes and report the remaining required input.

### Add CI validation

For repository CI, prefer the Records CLI:

```bash
records validate-file <resource-directory> --format junit
```

If the repository does not already install `@records-fhir/cli`, add an explicit install step instead of assuming `records` is globally available. Use `RECORDS_API_URL` and authentication only when the user wants full API-backed validation. The current CLI uses global options: `--api-url <url>` and `--auth-token <token>`. Do not use a `--server` flag for `records validate-file`.

### Explain an OperationOutcome or issue

When given an OperationOutcome or Records issue list, summarize issues by severity and path. Explain what each issue means, identify which issues are safe to auto-fix, and separate anything that requires domain knowledge or terminology authority.

If Records MCP `explain_issue` is available, use it for Records `issueCode` values.

### Validate an IG folder

Inspect for `sushi-config.yaml`, `input/fsh`, `package.json`, `ig.ini`, `input/resources`, `fsh-generated/resources`, and `package`. Records local structural validation can check JSON resources only. Do not describe local CLI mode as "profile checks" or "profile JSON checks". Full IG/profile validation requires Records MCP/API/engine mode or another configured profile-aware validator. Say this boundary clearly.

If the user asks to validate "this IG folder" but no IG folder is identifiable, ask for the path and still state the boundary: once a path is provided, local Records CLI can run structural JSON validation, while full IG/profile validation needs Records MCP/API/engine mode or another configured profile-aware validator.

## Records CLI Commands

Use these commands for file or directory validation:

```bash
records validate-file <file-or-directory>
records --json validate-file <file-or-directory> --format json
records validate-file <file-or-directory> --format junit
records validate-file <file-or-directory> --engine
```

Inside a Records checkout, when `records` is not installed globally:

```bash
npm --prefix cli run dev -- validate-file <file-or-directory>
npm --prefix cli run dev -- --json validate-file <file-or-directory> --format json
```

For full API-backed validation, use the configured server:

```bash
records --api-url "$RECORDS_API_URL" --auth-token "$RECORDS_AUTH_TOKEN" validate-file <file-or-directory>
```

If the project stores the token as `RECORDS_API_KEY`, pass it explicitly:

```bash
records --api-url "$RECORDS_API_URL" --auth-token "$RECORDS_API_KEY" validate-file <file-or-directory>
```

If those commands are not available, check `cli/package.json` and the local CLI docs before guessing another command. Do not use the root `npm run validate` script for file validation; it evaluates existing validation runs by server ID.

## Hosted API Pattern

When `RECORDS_API_URL` is configured, send only the resources the user asked to validate:

```bash
curl -s -X POST "${RECORDS_API_URL}/api/validate" \
  -H "Content-Type: application/json" \
  ${RECORDS_API_KEY:+-H "Authorization: Bearer ${RECORDS_API_KEY}"} \
  -d @<file>
```

If the API returns 401 or 403, tell the user the API key is missing, invalid, or unauthorized. If the network fails, fall back to local or structural mode and label the result accordingly.

## Structural Fallback

Use this only when Records MCP, API, or local CLI are unavailable:

1. Parse JSON and report malformed JSON with the line/column when available.
2. Confirm `resourceType` exists.
3. Confirm obvious top-level required fields for common resources, such as `Observation.status` and `Observation.code`.
4. Check obvious primitive shape errors, such as arrays where objects are expected.

After fallback validation, state:

```text
Structural validation only. Records profile, terminology, reference, invariant,
metadata, custom-rule, anomaly, and evidence-report checks were not run.
Configure Records MCP or set RECORDS_API_URL/RECORDS_API_KEY for full validation.
```

If the Records CLI runs in local mode, label it as local structural validation. It can use the packaged FHIR R4 structural schema to check resource types, required fields, unknown fields, cardinality, primitive types, choice fields, and simple backbone children. It still does not perform IG profile resolution, terminology validation, invariant execution, reference validation, advisor rules, anomaly detection, or evidence reporting unless a full Records runtime is configured.

## Output Format

Report results in this order:

1. Summary: `<resource or path> - <errors> errors, <warnings> warnings, <info> info (Score: <score>/100)` when a score is available.
2. Errors first, grouped by aspect.
3. Warnings next.
4. Information last only when useful.
5. Concrete fix suggestions when available.

For each issue include severity, aspect, path, code, and message when available. Keep the result concise; for large batches, summarize counts first and show representative issues.

## Cross-Check Mode

If the user asks for a second opinion or validator comparison:

1. Run Records first.
2. If HAPI, Firely Terminal, or another validator is already configured locally, run it as a cross-check.
3. Separate issues into "agrees", "Records only", and "other validator only".
4. Do not download or install external validators without asking.

## CI/CD Mode

When the user wants CI integration, prefer the Records CLI or API-backed validation step. Example:

```yaml
- name: Validate FHIR resources with Records
  env:
    RECORDS_API_URL: ${{ secrets.RECORDS_API_URL }}
    RECORDS_API_KEY: ${{ secrets.RECORDS_API_KEY }}
  run: records --api-url "$RECORDS_API_URL" --auth-token "$RECORDS_API_KEY" validate-file ./fhir-resources --format junit
```

Adapt the command to the repository being edited. Do not claim CI is profile-aware unless the selected Records mode actually loaded profiles and terminology settings.

If `records` is not installed in CI, install the CLI first:

```yaml
- name: Install Records CLI
  run: npm install -g @records-fhir/cli

- name: Validate FHIR resources with Records
  run: records validate-file ./fhir-resources --format junit
```

## Safety Rules

- Do not send clinical data to third-party services by default.
- Do not cache validation results across sessions.
- Do not edit generated FHIR artifacts unless the source of truth is unavailable and the user asks for a direct patch.
- Do not claim full conformance validation when only structural fallback ran.
- Do not suggest switching from full Records validation to fallback mode for convenience.
