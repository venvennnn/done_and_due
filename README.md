# Done & Due

Done & Due turns a job photo and a voice note into an editable, evidence-backed invoice for an independent tradesperson. After the contractor confirms the bill, the PayPal Sandbox workspace can create a hosted PayPal invoice, send it or share a payment link, and refresh payment status. The public demo does the same journey with simulated delivery and payment.

The product name is Done & Due.

## Inspection

The repository started as a single `README.md` heading. There was no package manager, app code, or reference image in the tree. The two design references arrived as chat attachments and are stored at:

- `design/reference/fieldnote-overview-dashboard.jpg`
- `design/reference/fieldnote-invoice-review.jpg`

The redistributable sample job photo is `public/demo/kitchen-tap.jpg`.

Stack: Next.js 15 App Router, React 19, TypeScript, Tailwind CSS 4, Radix dialogs, Lucide, Zod, Supabase (`@supabase/ssr`), `@google/genai`, PayPal Invoicing v2 over HTTPS. Package manager is npm 10. Node 22 (`engines` and `.nvmrc`).

## Checklist

| Priority | Item | Status |
| --- | --- | --- |
| P0a | Public demo: capture, draft, evidence, approval, simulated buyer and payment | Implemented. Browser verification is recorded in Verification. |
| P0b | PayPal Sandbox workspace, real invoice creation, link-only delivery, refresh, webhook | Implemented. Live Sandbox smoke is pending until the operator adds credentials. Contract fixtures cover create, uncertain outcome, delivery vs settlement, and webhook signatures. |
| P0c | Gemini transcription, grounded lines, evidence markers | Implemented behind `GEMINI_API_KEY`. Manual lines and typed notes work when Gemini is absent. A real photo-and-voice smoke test is pending a key. |
| P1 | Webhook reconciliation, invoice history, price list, overview | Implemented. Race and retry behavior is covered by the PayPal service tests. Email delivery against a real Sandbox buyer is an operator step. |
| P2 | Extra dashboards and deployment polish | Overview, jobs, invoices, price list, CSV export, health check, Dockerfile, and Vercel notes are in place. Notification bell is hidden. Production PayPal is deferred. |

## Two entry points

| Path | Who | After approval |
| --- | --- | --- |
| `/` then **Try the demo** → `/demo` | Anyone | Done & Due simulates sending and payment in the browser. No Gemini, Supabase, or PayPal calls. |
| `/` then **Open PayPal workspace** → `/app` | Allowlisted contractor | Done & Due creates a PayPal Sandbox invoice. Missing credentials show setup names and never fall back to simulation. |

The workspace badge reads **Demo · Simulated** or **PayPal Sandbox**. Route and server workspace binding choose the adapter. A URL parameter or a demo id cannot promote an invoice. Provider routes reject ids that start with `demo_`.

## Local start

```bash
npm ci
npm run dev
```

Open http://localhost:3000. The demo works with every secret unset.

```bash
npm run lint
npm run typecheck
npm test
npm run eval
npm run build
```

`npm run eval:live` is opt-in. It does not call Gemini unless staged voice files are added; the current manifest has text fixtures and one published photo.

## Demo

The public demo opens on Cashflow Pulse for the week of 11 November 2026. Opening cash is $310 as of that Wednesday. Reece Plumbing’s $500 bill is due Friday 13 November. Alex Morgan’s kitchen tap invoice INV-024 is $240 ($120 labor, $110 mixer tap, $10 consumables). Jamie Reed’s overdue service call INV-023 is $80.

1. Open `/demo`. The first screen shows **$190 short** on Friday and **Ask Alex to pay by Thursday**.
2. Preview Jamie only, Alex only, both, and Alex arriving Monday. Friday closes at −$110, +$50, +$130, and −$190.
3. Open Alex’s invoice, select the mixer tap, and confirm the transcript highlights “$110” while the photo circles the tap and points to it.
4. Draft the simulated reminder, then open the labeled buyer page.
5. Simulate payment. The invoice is paid and Friday’s baseline buffer is $50 under the labeled Thursday availability assumption.
6. Start a second job from **New job**. Replaying Alex’s sample returns the existing INV-024 instead of a second copy.
7. Reload keeps the demo. **Reset demo** returns the $190 Friday gap.

**Load missing-duration example** leaves labor unresolved so approval stays blocked. Renaming a line to "tap" abstains between the catalog mixer taps. An empty recipient email also blocks approval.

## Forecast

Business dates are `YYYY-MM-DD` in the workspace timezone. The demo timezone is Australia/Perth and the labeled reference date is 2026-11-11. The opening balance is end of day on the as-of date. The forecast starts the next day.

```
cash_in(d)  = eligible receipts available on d
cash_out(d) = committed outflows scheduled on d
closing(d)  = opening + sum(cash_in(t) - cash_out(t)) through d
shortfall(d) = max(0, -closing(d))
buffer(d)    = max(0,  closing(d))
```

A scenario adds selected collectible amounts on their assumed dates and does not write those amounts into the ledger. Confirmed payment and funds available to spend stay separate. A paid invoice with no availability date stays out of the baseline and reads **Paid · availability unknown**.

## Migrations

Apply `supabase/migrations/001_init.sql`, then `002_cash_ledger.sql`. Cash figures are stored in `workspaces.state.cash`. The second migration adds a read-only `workspace_cash` view.

Demo audio is local playback. Typed notes are the transcription path. Photos and recordings stay in IndexedDB when the browser supports it.

## Configuration

Copy `.env.example` to `.env.local`. Names used by the code:

| Group | Names |
| --- | --- |
| App | `NEXT_PUBLIC_APP_URL`, `APP_ENV` |
| Supabase | `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` |
| Gemini | `GEMINI_API_KEY`, `GEMINI_TRANSCRIPTION_MODEL`, `GEMINI_VISION_MODEL` |
| PayPal | `PAYPAL_ENV`, `PAYPAL_CLIENT_ID`, `PAYPAL_CLIENT_SECRET`, `PAYPAL_WEBHOOK_ID`, `PAYPAL_MERCHANT_WORKSPACE_ID` |
| Access | `CONTRACTOR_EMAIL_ALLOWLIST` |

`PAYPAL_ENV` must be `sandbox`. Any other value is rejected. Default Gemini model ids follow the audio and image guides checked on 2026-11-10 (`gemini-3.5-flash` for transcription, `gemini-3.8-flash` for structured localization). Confirm both ids against the key you were issued before a live smoke test.

Obtain values from:

- Supabase project settings → API (URL, anon key, service role).
- Google AI Studio or the Gemini API console (API key).
- PayPal Developer Dashboard → Sandbox → Apps (client id and secret) and Webhooks (webhook id).
- The workspace UUID printed after the allowlisted contractor signs in the first time, saved as `PAYPAL_MERCHANT_WORKSPACE_ID`.

## Supabase

1. Create a project. Do not commit its keys.
2. Authentication → URL configuration: site URL `NEXT_PUBLIC_APP_URL`, redirect `NEXT_PUBLIC_APP_URL/app`.
3. Authentication → disable public signup, or leave it unused. Create one contractor user by hand.
4. Put that email in `CONTRACTOR_EMAIL_ALLOWLIST`.
5. Apply `supabase/migrations/001_init.sql` in the SQL editor. It creates the workspace tables, enables RLS for owner reads, and adds a private `evidence` bucket. Authenticated users cannot write invoice rows directly.
6. The service role is server-only. The browser uploads with a signed URL and never receives the service role.

One contractor workspace is bound to one deployment merchant through `PAYPAL_MERCHANT_WORKSPACE_ID`. A future partner integration can replace that binding. Arbitrary signups cannot invoice from it.

## PayPal Sandbox runbook

1. Create a Business sandbox merchant and a separate Personal sandbox buyer. Guide: https://developer.paypal.com/tools/sandbox/accounts/
2. Create a REST app on the merchant and copy the sandbox client id and secret. Dashboard: https://developer.paypal.com/dashboard/applications/sandbox
3. Set `PAYPAL_ENV=sandbox` and the client credentials.
4. Deploy or expose the app on public HTTPS. Register `https://<host>/api/webhooks/paypal` for invoicing events, including `INVOICING.INVOICE.PAID`, `INVOICING.INVOICE.UPDATED`, and `INVOICING.INVOICE.CANCELLED`.
5. Sign in at `/app/sign-in` as the allowlisted contractor.
6. Copy the workspace id into `PAYPAL_MERCHANT_WORKSPACE_ID` and restart.
7. Load the labeled sample job. Leave the recipient email blank, then type the sandbox buyer's email. The demo address `emma.wilson@example.com` is not copied into PayPal.
8. Approve the snapshot. Choose **Create PayPal draft**. That does not email the buyer.
9. On a second invoice, use **Send through PayPal**. On another, use **Create shareable payment link**. Open the hosted payer view as the sandbox buyer and pay with sandbox funds.
10. Confirm the contractor timeline after the webhook, then use **Refresh from PayPal**. The stored link remains after reload.

Pending and partial states are covered by provider fixtures in `tests/paypal-service.test.ts` when the sandbox UI does not produce them.

This app uses PayPal Invoicing v2 (`POST /v2/invoicing/invoices`, `POST /v2/invoicing/invoices/{id}/send`, `GET /v2/invoicing/invoices/{id}`, `POST /v2/invoicing/search-invoices`). The buyer pays on PayPal's hosted invoice. Checkout and the browser JavaScript SDK are not used.

## State

Approval, delivery, and settlement are separate. A paid event never marks an invoice sent. Allowed transitions live in `src/lib/domain/transitions.ts`. Provider operations are `claimed`, `succeeded`, `failed_safe_to_retry`, or `outcome_unknown`. An unknown create blocks another create until reconciliation. More than one invoice-number match is an operator error.

## Deployment

Health check: `GET /api/health`.

### Vercel

Import the repo with the Next.js preset. Set the variables above per environment. Apply the SQL migration yourself. Use the same Supabase project only when preview and production callback URLs are intentionally shared; otherwise use separate projects. Media uploads go to Storage, not through the function body.

### Railway

Build with the Dockerfile. It is a multi-stage Node 22 image, `output: "standalone"` only when `DOCKER_BUILD=1`, and it copies `public` and `.next/static`. The server binds `0.0.0.0` and Railway's `PORT`. Point a health check at `/api/health`. Set the same variables. Durable files belong in Supabase Storage, not on the container disk.

Do not enable live PayPal. Do not publish this repository or the app unless you mean to.

## Verification

Ran on this workspace with provider credentials unset. Unit and contract tests use stubs, not PayPal or Gemini.

| Check | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run typecheck` | Passed |
| `npm test` | 21 passed. Forecast scenarios, demo journey, PayPal create/retry/webhook/reminder rejection. |
| `npm run eval` | 24 fixture jobs. Clean case incorrect dollars 0. Missing-duration case stays unresolved. Gemini arms marked pilot pending. |
| `npm run build` | Passed. `/api/health` returns `payments: sandbox-only`. |
| Automated unit tests | Passed. Friday scenarios, late availability, earlier shortfall, same-day timing, overdue bills, cumulative receipts, refunds, stale observations, reminder rejection, demo reset. |
| Browser demo, credentials unset | Passed on desktop and 375px. $190 Friday gap, scenario matrix, tap circle with leader arrow, simulated reminder and buyer page, paid invoice with a $50 Friday buffer, reset back to $190. Requests stayed on 127.0.0.1. |
| Real Gemini extraction | Pending. Needs `GEMINI_API_KEY`. Typed notes and manual lines still work. |
| Sandbox invoice creation and buyer payment | Pending. Needs Sandbox REST credentials, a separate buyer account, and `PAYPAL_MERCHANT_WORKSPACE_ID`. No buyer payment was observed in this run. |
| Verified webhook delivery | Pending. Needs the same Sandbox app and a public HTTPS URL for `/api/webhooks/paypal`. Manual refresh is the local substitute. |
| Docker image | Not run. `docker` is not installed in this environment. |
| Live PayPal buyer payment | Blocked. Needs sandbox merchant, buyer, and secrets. |
| Live Gemini photo-and-voice | Blocked. Needs `GEMINI_API_KEY` and a fresh recording. |

Screenshots from the browser pass: overview and review at desktop and 390px, plus the PayPal setup screen.

Remaining operator commands after secrets are set:

```bash
npm run dev
# sign in at /app, approve a sandbox invoice, create a draft, then send or share
npm run eval:live
```

## Public repository checklist

- [x] No filled secrets in the tree. `.env.example` uses empty placeholders.
- [x] Demo runs without credentials.
- [x] Service role and PayPal secret stay server-side.
- [x] Sandbox only. Production payments are a future release.
- [x] Sample photo is an original generated asset, not a customer photo.
- [ ] Replace the MIT license if the repository owner wants a different one before publishing.
- [ ] Confirm Gemini model ids against the issued key.
- [ ] Register the HTTPS webhook only on a deployment you control.
- [ ] Do not change repository visibility from this app.

## Video outline (under three minutes)

1. Home: Try the demo versus Open PayPal workspace, and which path simulates payment.
2. Demo overview from stored records, then the sample kitchen-tap job.
3. Review: tap marker, labor quote, Not billed connectors, edit labor to 1.5 hours, $130 total.
4. Approve, simulate send, buyer banner, pending → partial → paid, dashboard after reload.
5. PayPal workspace setup screen with missing names only, then stop. Do not show a live payment unless the operator recorded a sandbox buyer.

## Evaluation

`npm run eval` writes `eval/output/jobs.csv` and `eval/output/report.md` for 24 staged notes. The catalog arm uses the deterministic parser. Voice-only and photo-plus-voice arms are marked pilot pending. Thresholds are frozen in `CATALOG_MATCH_THRESHOLDS` (`fuzzyMinScore` 0.72, `fuzzyMinMargin` 0.12, `maxSuggestions` 3).

A future correction-risk model can train on persisted proposed values, reason codes, and reviewer corrections. This release uses rules only.

## Scope

Currency is a two-decimal workspace currency. The sample is USD. One merchant per deployment. Sent snapshots stay read-only. Changing an approved bill requires a new approval and reconciliation of the existing PayPal draft before another create.
