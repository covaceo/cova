# Rithmic connector boundary

Status: sandbox implementation, not a production availability claim.

## Topology

- `api/rithmic/sync.js` is the authenticated Cova Pro endpoint.
- `api/rithmic/status.js` keeps credential fields hidden unless the signed private service and durable nonce claim are reachable.
- `api/rithmic/nonce.js` is an HMAC-authenticated server-only callback. It atomically claims each request ID with Redis `SET NX` and a ten-minute TTL. The existing private Supabase Storage path remains a fail-closed fallback.
- It validates the browser payload, fixes the target to `Rithmic Test`, and signs the exact JSON request with HMAC-SHA256.
- `api/_lib/rithmic-service.js` calls an explicitly configured HTTPS service and only returns a bounded allowlisted response shape.
- The licensed R | Protocol API implementation and protocol definitions stay in a separate private service repository. They must never be copied into this public repository.

## Credential lifecycle

The Rithmic username and password are accepted for one user-triggered sync, held only in request memory, and discarded after the provider session logs out. Cova does not persist them in Supabase, browser storage, logs, or analytics. Multiple accounts require an explicit account choice and a new password entry.

Required server-only variables:

```text
RITHMIC_CONNECTOR_URL=https://<private-service>/api/sync
COVA_RITHMIC_SERVICE_SECRET=<32+ random bytes>
KV_REST_API_URL=https://<nonce-store>.upstash.io
KV_REST_API_TOKEN=<server-only token>
```

Never prefix either value with `VITE_`.

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

Production remains blocked until:

- the private service is placed in a private GitHub repository and deployed
- production secrets are generated and configured on both server boundaries
- the free, non-auto-upgrading Redis nonce store is connected and a signed replay is rejected atomically
- provider agreements are accepted if presented
- a real non-Test account returns history and mapping is verified against its source records
- Rithmic conformance screenshots and required proof are submitted and accepted
- Raf approves the final rendered integration and release
