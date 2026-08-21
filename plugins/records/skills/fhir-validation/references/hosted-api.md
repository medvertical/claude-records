# Hosted Records API Contract

Use this contract only when the user explicitly requests hosted Records validation and the privacy gate permits sending the selected resource.

## Configuration

- Read the API base URL from `RECORDS_API_URL`. The canonical MedVertical-hosted base URL is `https://records.api.medvertical.com`, without a trailing `/api`.
- Read the interactive bearer token from `RECORDS_AUTH_TOKEN`. Never print, log, persist, or inspect the complete value.
- `RECORDS_API_KEY` is a conventional CI secret name used with the Records CLI `--auth-token` option. Do not treat it as the interactive plugin token.

## Validation Request

Send `POST {RECORDS_API_URL}/api/validation/validate-resource-detailed` with:

```json
{
  "resource": { "resourceType": "Observation" },
  "fhirVersion": "R4"
}
```

Add `profile` only when the user or project supplies a canonical profile URL. Do not add or guess a `serverId`: this endpoint is stateless live validation and must not read or write workspace evidence.

Use `Authorization: Bearer <RECORDS_AUTH_TOKEN>` and `Content-Type: application/json`. Treat `401`, `403`, and `5xx` responses as remote-validation failures. Do not silently switch to local validation when the user explicitly required the hosted API.

## Output Boundary

Report the API mode, FHIR version, issue counts, issue paths/codes, and minimal safe fix guidance. Never reproduce the token or unnecessary clinical content.
