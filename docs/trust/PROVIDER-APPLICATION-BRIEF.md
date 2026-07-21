# Cova Provider Application Brief and Outreach Template

**Product:** Cova
**Website:** https://covadesk.com
**Security:** https://covadesk.com/#security
**Privacy:** https://covadesk.com/#privacy
**Terms:** https://covadesk.com/#terms
**Contact:** support@covadesk.com

## One-paragraph product description

Cova is a retrospective trade-journal, risk-review, simulation, and local performance-summary product for active futures traders. A member can import CSV history or authorize a supported provider connection, review account and fill history against user-configured limits, and generate a local Risk Passport PNG summarizing the reviewed sample. Cova does not execute, modify, cancel, route, copy, or recommend trades, manage brokerage settings, transfer funds, or custody assets.

## Requested provider access

Cova requests only the minimum provider-supported access needed to:

- identify the member's selected trading account;
- retrieve account-history fields required to contextualize the review;
- retrieve fills and completed trade history;
- refresh that history when the member explicitly requests synchronization.

Cova connector code contains no order-placement, order-modification, order-cancellation, position-management, withdrawal, funds-transfer, or brokerage-settings calls. If a provider-issued token carries broader permissions than Cova needs, Cova still enforces its own endpoint allowlist and instructs the member to revoke provider authorization separately when finished.

## Security and privacy summary

- Supabase passwordless member authentication.
- Authenticated Bearer validation on sensitive connector routes.
- Connector rows bound to the verified member ID.
- Signed, short-lived OAuth state bound to the initiating member.
- AES-256-GCM encryption for persisted provider tokens.
- Provider credentials and service-role secrets remain server-side.
- ProjectX raw API keys are discarded after authentication and are not persisted.
- Browser receives an opaque Secure, HttpOnly, SameSite connector cookie, not a provider token.
- Disconnect, sign-out, account deletion, and token-expiry cleanup remove active Cova connector records.
- Cova does not sell personal information or use advertising trackers for behavioral advertising.
- Imported journal and Practice data are primarily stored in first-party, member-scoped browser storage.
- Risk Passport output is a local PNG, not independent verification or a Cova-hosted credential.

A detailed control and data-flow packet is available in `PROVIDER-SECURITY-AND-PRIVACY-PACKET.md`.

## Provider-specific request

Please confirm:

1. the approved production application and redirect-URI process;
2. the minimum available account and completed-trade history scope;
3. whether the proposed encrypted token/session storage is permitted;
4. the provider-side token or API-key revocation procedure;
5. any required branding, incident-notification, retention, or security-review terms;
6. whether reviewed account-history fields may appear in a user-controlled local PNG export.

## Send-ready email

**Subject:** Cova read-only trade-history integration review

Hello [Provider/API Partnerships Team],

I’m Raf, the owner of Cova, a retrospective futures trade-journal and risk-review product at https://covadesk.com.

Cova is seeking approval for a minimum-access integration that identifies a member's account and retrieves completed trade/fill history for user-requested retrospective analysis. Cova does not contain order placement, modification, cancellation, position-management, withdrawal, funds-transfer, or brokerage-settings calls.

Our public product boundaries and controls are available here:

- Security and data handling: https://covadesk.com/#security
- Privacy: https://covadesk.com/#privacy
- Terms: https://covadesk.com/#terms

Implemented controls include authenticated member binding, signed short-lived OAuth context, AES-256-GCM token encryption, server-only provider credentials, owner-scoped connector records, and disconnect/account-deletion cleanup. I can also provide our detailed provider security and privacy packet, endpoint allowlist, and data-flow summary.

Could you please direct me to the application review process and confirm the minimum account and completed-trade history access available for this use case? I would also appreciate your requirements for redirect URIs, token revocation, branding, retention, and security review.

Thank you,

Raf
Cova
support@covadesk.com
https://covadesk.com

## Do not claim in outreach

Do not describe Cova as provider-approved, independently audited, penetration-tested, SOC 2 certified, a broker, a trading adviser, a verified performance service, or a read-only token implementation unless the specific provider has technically restricted the issued token to read-only scope. Describe Cova's own connector behavior as non-executing and endpoint-allowlisted instead.
