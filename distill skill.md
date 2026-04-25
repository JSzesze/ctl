---

## name: distill-transcribe-api

description: >-
  Authenticated HTTP access to Distill/Transcribe documents on Convex (list,
  detail, full transcript, notes). Use when the user or task needs to fetch
  document metadata, transcripts, or notes via the Document API — not for
  creating API keys in chat (keys belong in gateway/server config).

# Distill — Document HTTP API (API keys)

Base URL is the Convex **site** URL from the dashboard, e.g. `https://<deployment>.convex.site`.

## When to apply

- User asks to **list**, **open**, **summarize**, or **quote** their transcripts or notes from Distill/Transcribe.
- You need to know **which paths and headers** to use for server-side or tool calls.

## Agent / tool constraints

- **Do not** ask the user to paste `sk_…` secrets into chat for routine use. Prefer **gateway env**, **secrets store**, or **tool configuration** the operator already set.
- Every request must send auth (see below). Keys must start with `sk_` so they are not confused with Clerk JWTs.
- Responses are `Cache-Control: private, no-store`.

## Authentication

**In the product:** Settings → API ACCESS → Document API → generate key. The app may store the last key in device secure storage; the server stores only a **hash**.

**Programmatic key creation:** Convex mutation `userApiKeys:create` (while authenticated) returns the full secret **once** (`sk_` + hex).

Send the key on every request using **either**:

- `Authorization: Bearer sk_…`
- `X-API-Key: sk_…`

Invalid or revoked keys → **401**.

## Endpoints


| Method | Path                                       | Description                                                                          |
| ------ | ------------------------------------------ | ------------------------------------------------------------------------------------ |
| `GET`  | `/api/v1/documents`                        | List non-draft documents (metadata + short `transcriptPreview` when available).      |
| `GET`  | `/documents`                               | Same as list (short alias).                                                          |
| `GET`  | `/api/v1/documents/:documentId`            | One document (same shape as list rows).                                              |
| `GET`  | `/documents/:documentId`                   | Detail (short alias).                                                                |
| `GET`  | `/api/v1/documents/:documentId/transcript` | Full transcript bundle (`transcript`, `cleanedTranscript`, `summary`, status, etc.). |
| `GET`  | `/documents/:documentId/transcript`        | Transcript (short alias).                                                            |
| `GET`  | `/api/v1/documents/:documentId/notes`      | Notes `text` / `html` when present.                                                  |
| `GET`  | `/documents/:documentId/notes`             | Notes (short alias).                                                                 |


**Query params**

- List only: `limit` — default `50`, max `200`.

**Errors**

- **404** — wrong id, not the user’s document, or draft.
- **400** — malformed document id.

Documents must have the owner’s `userId`; **drafts** are excluded from list and detail routes.

## Examples

Replace `DEPLOYMENT`, `sk_…`, and `DOCUMENT_ID`.

```bash
# List
curl -sS -H "Authorization: Bearer sk_YOUR_KEY" \
  "https://DEPLOYMENT.convex.site/api/v1/documents?limit=20"

# Summary row
curl -sS -H "X-API-Key: sk_YOUR_KEY" \
  "https://DEPLOYMENT.convex.site/api/v1/documents/DOCUMENT_ID"

# Full transcript bundle
curl -sS -H "Authorization: Bearer sk_YOUR_KEY" \
  "https://DEPLOYMENT.convex.site/api/v1/documents/DOCUMENT_ID/transcript"

# Notes
curl -sS -H "Authorization: Bearer sk_YOUR_KEY" \
  "https://DEPLOYMENT.convex.site/api/v1/documents/DOCUMENT_ID/notes"
```

## Managing keys (app / Convex)

- **Create** — `userApiKeys:create` (optional `label`) → `{ keyId, apiKey }`.
- **List** — `userApiKeys:listMine` (no secrets).
- **Revoke** — `userApiKeys:revoke` with `{ keyId }`.

Revoked keys stop working immediately.

## Related

- **Public** read by slug (no API key): `GET /public/documents/:slug` (published documents only).

