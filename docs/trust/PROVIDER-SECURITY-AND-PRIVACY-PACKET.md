# Cova Provider Security and Privacy Packet

**Product:** Cova (`covadesk.com`)
**Contact:** support@covadesk.com
**Prepared:** July 21, 2026
**Status:** Public legal and trust release deployed to `covadesk.com` on July 21, 2026 at commit `a1013b6`. Provider connectors remain beta pending provider approval, production environment validation, and verification that the included Supabase ownership migration has been applied. This packet must not be represented as a certification or independent assessment.

## 1. Service boundary

Cova is a retrospective trade-journal, risk-review, simulation, and local Passport-export product. It is not a broker, execution venue, account manager, signal service, investment adviser, or custodian.

Cova connector code does not contain order placement, order modification, order cancellation, withdrawal, funds-transfer, or brokerage-settings calls. Provider-issued tokens may nevertheless carry permissions broader than Cova's own endpoint allowlist. Users are instructed to revoke provider authorization separately when available.

## 2. Data-flow summary

```text
Member browser
  |-- Supabase magic-link authentication
  |-- CSV import -> member-scoped browser storage
  |-- Practice simulation -> member-scoped browser storage
  |-- authenticated Bearer request -> Cova Vercel API
                                      |-- verifies member with Supabase Auth
                                      |-- calls approved provider endpoints
                                      |-- encrypts provider session token (AES-256-GCM)
                                      '-- stores owner-bound record in Supabase

Provider callback
  |-- signed, ten-minute OAuth context
  |-- state validation before provider error handling
  |-- initiating-user binding
  '-- opaque Secure + HttpOnly + SameSite cookie returned to browser
```

The browser never receives the provider access token or the Supabase service-role credential.

## 3. Connector access matrix

| Provider | Credential entry | Cova endpoint allowlist | Explicit exclusions | Current qualification |
|---|---|---|---|---|
| Tradovate | OAuth authorization code on provider flow | Token exchange plus account and trade-history retrieval used by the connector | No order, account-setting, withdrawal, or funds calls | OAuth scope is deployment-configured through `TRADOVATE_SCOPE` and must be approved/pinned to the minimum provider-supported history scope before production enablement |
| ProjectX / TopstepX | User-generated API key submitted over TLS to Cova backend | `api/Auth/loginKey`, `api/Account/search`, `api/Trade/search` | No order placement, modification, cancellation, position-management, withdrawal, or settings endpoint | Raw API key is discarded after authentication; encrypted session token may carry broader provider permissions, so user-side revocation remains required |
| CSV | File selected locally by member | No provider API | No credentials or provider token | Default supported import path |
| Other firms | Provider-hosted flow only when explicitly configured, otherwise CSV | No live connector claimed unless configured and approved | Preview form forbids real credential entry | Preview/research only |

## 4. Authentication and owner binding

- Production authentication uses Supabase passwordless magic links.
- Sensitive connector routes require `Authorization: Bearer <Supabase access token>`.
- The server verifies the token directly with Supabase Auth before processing connector input.
- Connector records contain a non-null Supabase `user_id` foreign key.
- Every connector lookup and deletion includes the authenticated `user_id`.
- Supabase row-level security restricts member SELECT and DELETE access to `auth.uid() = user_id`; server operations use the service role.
- Account deletion removes connector records before deleting the Supabase Auth user.
- User deletion cascades to connector records as a database-level backstop.
- Cached browser session data does not unlock a production workspace before Supabase confirms the session.
- Pro entitlement is read only from administrator-controlled Supabase `app_metadata`, not user-editable profile metadata.

## 5. OAuth integrity

- Authorization is initiated by authenticated POST, not an unauthenticated redirect.
- OAuth state uses 32 cryptographically random bytes.
- Cova stores a signed context containing the state, initiating user ID, and creation time.
- Context signatures use HMAC-SHA-256 and a server-only secret.
- Contexts expire after ten minutes.
- Callback state is validated before provider-returned error text is handled.
- The callback revalidates the current member and requires the same initiating user.
- OAuth context and connector cookies are Secure, HttpOnly, SameSite=Lax, path-scoped first-party cookies.

## 6. Token handling

- Provider access and refresh tokens are encrypted before persistence using AES-256-GCM.
- Each ciphertext uses a random 96-bit IV and authentication tag.
- The encryption key is a server-only 32-byte deployment secret.
- Provider tokens are decrypted only inside server connector routes after member and record-owner checks.
- ProjectX raw API keys are used for provider authentication and are not persisted.
- Responses do not expose provider tokens or database connection IDs.
- Expired rows are rejected and deleted during lookup.

## 7. Local data and Passport exports

- Imported CSV trades, configured review limits, Practice records, and workspace state are primarily held in browser storage.
- Storage keys are namespaced to the verified Supabase user or explicit local demo identity.
- Switching users remounts Practice state and loads the new identity namespace.
- Sign-out clears that member's local Cova namespace and removes server-side connector records.
- Risk Passport output is a downloaded local PNG. Cova does not host, revoke, or expire the image after download.
- Sample/demo Passports are visibly marked as demo data and not account verification.
- Cova ranks and review references are product-generated calculations, not broker verification, audited performance, identity certification, funding approval, or predictions.

## 8. Deletion and lifecycle

| Event | Cova behavior |
|---|---|
| Disconnect | Deletes the authenticated member's selected encrypted connector record and clears its cookie |
| Sign out | Deletes all connector records for that authenticated member, clears both connector cookies, clears member-scoped local data, then signs out |
| Account deletion | Deletes all connector records, deletes the Supabase Auth user, clears connector/OAuth cookies, and sends `Clear-Site-Data` for cache, cookies, and storage |
| Token expiry | Rejects and deletes the expired connector row during lookup |
| Provider revocation | Member must also revoke at the provider where no programmatic revocation endpoint is available |

Authentication, security, abuse, backup, and infrastructure records may remain only when required for security, legal obligations, or provider-controlled backup/log lifecycles. Cova has not published a fixed log-retention duration that has not yet been operationally verified.

## 9. Infrastructure and subprocessors

| Service | Purpose | Data categories |
|---|---|---|
| Vercel | Static hosting, serverless API, TLS/request delivery | Request metadata, IP, user agent, API payload in transit, operational logs |
| Supabase | Passwordless authentication and owner-bound encrypted connector rows | Email, auth identifiers/metadata, encrypted provider tokens, connector metadata |
| Stripe | External checkout when enabled | Billing identity and payment details handled by Stripe; Cova receives plan/subscription status |
| Google Workspace | Support email | Support correspondence and attachments sent by the user |
| Discord | Optional community | Information a member separately supplies to Discord/community spaces |
| Trading providers | Requested account-history connection | Provider account identifiers, balances, fills, trades, statements, and authorization tokens |

Cova states that it does not currently use advertising trackers or sell/share personal information for behavioral advertising.

## 10. Web and application controls

- HTTPS/TLS on production hosting.
- Content Security Policy restricted to first-party resources and Supabase connections.
- HSTS, frame denial, MIME sniffing prevention, restrictive referrer policy, and permissions policy.
- Standard `/.well-known/security.txt` with support contact and policy link.
- No external Google Fonts requests; production fonts are bundled.
- Sensitive API responses use private/no-store cache behavior.
- Server errors returned to the browser are sanitized to avoid leaking secret-bearing provider or storage details.
- Dependency audit and production build are required release gates.

## 11. Incident response

Security reports go to support@covadesk.com. Cova's response workflow is:

1. acknowledge and triage the report;
2. preserve necessary evidence without disclosing unrelated user data;
3. contain affected credentials, routes, or deployments;
4. rotate compromised secrets and revoke affected sessions/tokens where possible;
5. patch and verify the root cause;
6. assess notification duties and notify affected users, providers, and authorities when legally required;
7. document corrective action and update safeguards or public disclosures.

Researchers are instructed not to access other users' data, disrupt service, or publicly disclose sensitive details before Cova has a reasonable investigation opportunity.

## 12. Verification evidence

Release-candidate gates include:

- `npm test`
- `npm run build`
- `npm audit --omit=dev`
- `git diff --check`
- API JavaScript syntax checks with `node --check`
- behavioral API regression for bearer authentication, user ownership, signed OAuth context, missing-auth rejection, and state-first callback handling
- legal/trust regression for public routes, affirmative signup assent, connector ownership, RLS migration text, disconnect, and deletion
- desktop/mobile rendered route review and post-deployment verification on `covadesk.com`

Production verification on July 21, 2026 confirmed:

- `covadesk.com` served the merged asset containing the Privacy, Terms, and Security routes;
- CSP, HSTS, frame denial, restrictive referrer policy, and permissions policy were present;
- `/.well-known/security.txt` served the published contact and canonical URL;
- unauthenticated Tradovate status, ProjectX status, disconnect, and account-deletion requests returned HTTP 401;
- the production Security route rendered without horizontal overflow, broken images, or console errors.

## 13. Open provider dependencies

- The production Supabase ownership/RLS migration included at `supabase/tradovate_connector.sql` must be applied and verified before connectors are described as production-ready.
- Tradovate must approve the application, redirect URI, and minimum permitted history scope.
- ProjectX/TopstepX must confirm API-key and session-token terms permit this retrospective account-history use.
- Provider-side token revocation support must be documented if available.
- Cova must not describe a connector as production-ready until provider approval, production environment configuration, migration, and live owner-switch testing are complete.

## 14. No certification claim

This packet describes implemented and release-candidate controls. It is not a SOC 2 report, penetration-test report, legal opinion, independent audit, or guarantee of security.
