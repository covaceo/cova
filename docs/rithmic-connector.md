# Rithmic connector boundary

Status: the signed Rithmic Test connector infrastructure is deployed. Normal Rithmic Paper / Rithmic 01 customer connectivity remains provider-gated and is not a production availability claim.

## Topology

- `api/rithmic/sync.js` is the authenticated Cova Pro endpoint.
- `api/rithmic/status.js` keeps credential fields hidden unless the signed private service and durable nonce claim are reachable.
- The private service atomically claims each signed request ID with Redis `SET NX` and a ten-minute TTL before any provider login.
- It validates the browser payload, fixes the target to `Rithmic Test`, and the public bridge signs the exact JSON request with HMAC-SHA256.
- `api/_lib/rithmic-service.js` calls an explicitly configured HTTPS service and only returns a bounded allowlisted response shape.
- The licensed R | Protocol API implementation and protocol definitions stay in a separate private service repository. They must never be copied into this public repository.

## Credential lifecycle

The Rithmic username and password are accepted for one user-triggered sync, held only in request memory, and discarded after the provider session logs out. Cova does not persist them in Supabase, browser storage, logs, or analytics. Multiple accounts require an explicit account choice and a new password entry.

Required server-only variables:

```text
RITHMIC_CONNECTOR_URL=https://<private-service>/api/sync
COVA_RITHMIC_SERVICE_SECRET=<32+ random bytes>
KV_REST_API_URL=https://<rate-limit-store>.upstash.io
KV_REST_API_TOKEN=<server-only token>
```

Never prefix any of these values with `VITE_`.

## Data path

The private service:

1. logs into the order plant with infrastructure type `2`
2. discovers authorized accounts
3. bootstraps FIFO inventory from account creation, then requests fill history serially in windows no longer than 30 days
4. subscribes for order updates and replays current-session executions once
5. requests provider reference data for contract point values
6. deduplicates fills and pairs entries/exits FIFO
7. refuses to invent P&L when contract values are missing and labels computed P&L as gross before commissions
8. attaches immutable Rithmic/account provenance to every normalized trade, returns a bounded closed-trade ledger, and logs out

There are no order-entry, order-change, cancellation, or fund-movement calls.

## Provider attribution

Do not add a generic homepage “Powered by Rithmic” section. Rithmic instructed Cova to show the official `Trading Platform by Rithmic` and `Powered by OMNE` artwork when users log into Rithmic or view Rithmic-originated data, together with the applicable notices. The authenticated import and dashboard surfaces own that attribution.

Do not describe Cova as sponsored, endorsed, or powered by Rithmic outside the required artwork context.

## Release gate

Completed engineering gates:

- the licensed service remains in a private GitHub repository and is deployed behind HMAC authentication
- shared production secrets are configured on both server boundaries
- one free Upstash Redis resource backs the private replay claim and public attempt/concurrency limits
- production proof returned signed status `200`, exact replay `409`, and one authenticated Rithmic Test account
- aggregate tests, clean-checkout builds, audits, desktop/mobile QA, and required attribution checks passed

Remaining provider/product gates:

- Rithmic must provide or enable the normal customer production path
- a non-Test account must return real fill history and Cova's normalized ledger must be reconciled against the provider source
- Rithmic conformance evidence must be submitted and accepted
- Raf must approve normal customer availability after those checks; until then the UI must remain explicitly labeled `Rithmic Test`
