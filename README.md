# n8n-nodes-subtraq

This is an n8n community node. It lets you use [Subtraq](https://subtraq.co) in your n8n workflows: create tracked short links and placements, read clicks, leads, sales and attributed revenue, record sales, and start a workflow when Subtraq records a new lead or a new sale.

Subtraq follows a short link from the click to the lead, then to the sale, and tells which placement brought the revenue. A conversion it cannot tie to a click is reported as unattributed, never guessed.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation) ·
[Operations](#operations) ·
[Trigger](#trigger) ·
[Credentials](#credentials) ·
[Compatibility](#compatibility) ·
[Usage](#usage) ·
[Resources](#resources) ·
[Version history](#version-history)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation. The package name is `n8n-nodes-subtraq`.

The package has no runtime dependency.

## Operations

The **Subtraq** node:

| Resource | Operation | What it does |
|---|---|---|
| Link | Create | Creates a short link to a page, or a **placement** under an existing link: a placement inherits the destination of its parent and carries its own UTM parameters, so each post, ad or email is measured on its own. Optional slug, label, domain and idempotency key. Returns `shortUrl`, ready to publish |
| Link | Get | Reads a link, its final destination (UTM parameters included, as the landing page receives it) and its clicks over 30 days |
| Link | Get Many | Lists links, active, archived or both, for one workspace or the whole account |
| Link | Update | Changes the destination, label, domain or slug of a link, or archives it. The old address keeps redirecting. Links are never deleted |
| Analytics | Get Summary | The totals of a workspace over 7, 30 or 90 days or all time: clicks, leads, sales, attributed revenue and unattributed revenue, with the attribution model of your choice (first click, last click or linear) |
| Analytics | Get Per Placement | The same report as one item per link and placement: clicks, leads, sales and revenue. Ready to append to a spreadsheet |
| Sale | Record | Records a sale and ties it to the placement the buyer first came from, found by email, external ID or click ID. The invoice ID makes the call safe to repeat: the same invoice is never counted twice |
| Workspace | Create / Get Many | Creates a workspace (one client, brand or project), or lists them |

Amounts are in **cents**, as everywhere in Subtraq: `4300` means 43.00. Subtraq does not convert currencies: when a workspace holds several, `mixedCurrencies` is `true` and the totals only cover `currency`.

Errors from Subtraq keep their stable code (for example `slug_taken`, `link_limit_reached`, `space_not_found`), and the node adds what to do next.

The node is marked as usable by n8n AI agents as a tool.

## Trigger

The **Subtraq Trigger** node starts a workflow on:

- **New Lead**: a person left their email address on a site tracked by Subtraq
- **New Sale**: a sale was recorded, through the API, a Stripe webhook or the Subtraq node

It listens to every workspace of the account, or to one workspace. When you activate the workflow, the node subscribes through the Subtraq API (`POST /api/v1/webhooks`). When you deactivate it, the subscription is deleted.

Each call is checked against its `X-Subtraq-Signature` header (HMAC-SHA256 of the timestamp and the raw body, with the secret Subtraq returned for this subscription). A call without a valid signature, or older than five minutes, is answered with `401` and starts nothing.

Each item is the event as Subtraq sends it:

```json
{
  "event": "sale",
  "at": "2026-10-06T09:14:02.181Z",
  "space": { "slug": "maison-lartigue", "name": "Maison Lartigue" },
  "person": { "email": "buyer@example.com", "externalId": null },
  "placement": { "slug": "spring-meta", "label": "Meta ad, March" },
  "amountMinor": 4300,
  "currency": "EUR",
  "eventId": "cm8x0k2a90001"
}
```

`placement` is `null` when Subtraq could not tie the conversion to a click. For a lead, `amountMinor` and `currency` are `null`. `eventId` identifies the conversion: use it to ignore duplicates.

Subtraq calls your n8n over the internet: the webhook address of your n8n instance must be public and start with `https://`. Local and private addresses are refused. On a self-hosted n8n, set `WEBHOOK_URL` to its public address.

## Credentials

1. In Subtraq, open **Settings → API keys** and create a key. Tick the permissions the operations you use need (a key cannot be widened later):

   | Operations | Permission |
   |---|---|
   | Workspace › Get Many, Link › Get and Get Many, the workspace and link lists, the connection test | `links:read` |
   | Workspace › Create, Link › Create and Update | `links:write` |
   | Analytics | `analytics:read` |
   | Sale › Record | `events:write` |
   | Subtraq Trigger | `webhooks:write` |

2. In n8n, create a **Subtraq API** credential and paste the key (`stq_sk_…`). Keep the base URL `https://subtraq.co`.

The key is shown once in Subtraq and stored hashed: if you lose it, create a new one. A Subtraq account can be created on the free plan, without a credit card.

## Compatibility

Built with the official `@n8n/node-cli` (0.50) and n8n nodes API version 1. The package declares Node.js 20.15 or later.

## Usage

**Create one tracked link per post.** Start from a list of posts (a spreadsheet, a content calendar), then Subtraq › Link › Create with **Link Type: Placement Under a Link**, the parent link of the campaign, and the post's name as **Label**. Each placement returns its own `shortUrl`.

**Record a sale from your shop or billing tool.** On a new paid order, Subtraq › Sale › Record with the workspace, the amount in cents, the currency, the order number as **Invoice ID** and the buyer's email. The response says whether the sale was `attributed` to a click.

**Send a weekly report.** A Schedule Trigger, then Subtraq › Analytics › Get Per Placement over the last 7 days, then a spreadsheet or email node.

**Notify your team on each sale.** Subtraq Trigger on **New Sale**, then a chat or CRM node. The amount is in cents: divide `amountMinor` by 100 to display it.

## Resources

- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
- [Subtraq API reference](https://subtraq.co/en/developers) and its [OpenAPI description](https://subtraq.co/api/v1/openapi.json)

## Version history

See [CHANGELOG.md](CHANGELOG.md).
