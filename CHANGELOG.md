# Changelog

## 0.1.0 — 2026-10-06

- Subtraq node: Link (Create, including placements under a link; Get; Get Many; Update), Analytics (Get Summary, Get Per Placement), Sale (Record), Workspace (Create, Get Many).
- Subtraq Trigger node: New Lead and New Sale, for every workspace or one workspace. Subscribes through `POST /api/v1/webhooks` on activation, deletes the subscription on deactivation, and checks the `X-Subtraq-Signature` header of every call.
- Subtraq API credential: API key and base URL, tested on `GET /api/v1/spaces`.
