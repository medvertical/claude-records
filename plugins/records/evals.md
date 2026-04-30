# Records FHIR Validation Skill Evals

Use these prompts before releasing a new plugin version. The goal is not to prove model determinism; it is to catch obvious skill-regression patterns before publishing.

## 1. Single Invalid Patient File

Prompt:

```text
/records:fhir-validation validate this file: mii-patient-test.json
```

Expected behavior:

- Uses `records validate-file` or the local Records checkout equivalent when available.
- Labels local CLI output as local structural validation when full API/MCP validation was not used.
- Does not claim profile, terminology, or invariant validation unless a full Records runtime was used.

## 2. Invalid Pasted Observation JSON

Prompt:

```text
/records:fhir-validation { "resourceType": "Observation" }
```

Expected behavior:

- Parses the JSON.
- Reports missing `Observation.status` and `Observation.code` as structural issues.
- Does not invent clinical codes or status values without user context.
- States whether this was structural fallback or Records CLI validation.

## 3. Fix Loop

Prompt:

```text
/records:fhir-validation fix this invalid Observation and revalidate:
{ "resourceType": "Observation", "status": 12 }
```

Expected behavior:

- Validates first.
- Fixes only mechanical structural issues that are inferable.
- Does not invent `Observation.status` or `Observation.code`.
- Does not add placeholder `CodeableConcept.text` just to make validation pass.
- Revalidates after any patch.
- Reports before/after counts and remaining domain-input needs.

## 4. CI Setup

Prompt:

```text
/records:fhir-validation add GitHub Actions validation for ./examples
```

Expected behavior:

- Uses `records validate-file ./examples --format junit`.
- Uses `records --api-url "$RECORDS_API_URL" --auth-token "$TOKEN" validate-file ...` for API-backed validation.
- Adds an install step if `@records-fhir/cli` is not already available in the repository.
- Does not use a `--server` flag; the current CLI uses global `--api-url` and `--auth-token`.
- Does not switch to Firely/HAPI unless the user asks for cross-checking.
- Uses API credentials only when full API-backed validation is requested.

## 5. OperationOutcome Explanation

Prompt:

```text
/records:fhir-validation explain this OperationOutcome:
{
  "resourceType": "OperationOutcome",
  "issue": [
    {
      "severity": "error",
      "code": "required",
      "diagnostics": "Observation.status: minimum required = 1, but only found 0",
      "expression": ["Observation.status"]
    }
  ]
}
```

Expected behavior:

- Groups by severity.
- Explains the issue in plain language.
- Identifies safe vs domain-dependent fixes.
- Does not claim a full validation run happened.

## 6. IG Folder

Prompt:

```text
/records:fhir-validation validate this IG folder
```

Expected behavior:

- Inspects for FSH, IG Publisher, and package folders.
- Uses Records CLI for JSON resources when possible.
- Clearly states that full IG/profile validation needs Records MCP/API/engine mode or another configured profile-aware validator.
- Does not hallucinate unsupported Records commands.
