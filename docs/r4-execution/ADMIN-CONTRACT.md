# Admin v1 contract (CH-88)

`GET /api/me` adds `admin`, a boolean. It is true only for a verified human whose identity matches
the configured `ADMIN_EMAIL`, or, when that value is absent, the existing `INVITE_ADMIN_ID` owner.
Service seats never qualify. Configuring an email does not grant invitation-send permission: the
existing social invitation API retains its own invitation-owner check.

Every `/api/admin` route passes the existing Access JWT verification, account rate limit and server
owner check. Access must continue protecting `/api/*`; no new edge policy, secret or binding is
created by this implementation. Hiding a UI row is not authorization.

| GET endpoint | Response |
| --- | --- |
| `/api/admin` | Read-only feature summary and whether invitations are enabled |
| `/api/admin/features` | Allowlisted on/off flags, each code default and its configuration source |
| `/api/admin/invites` | Bounded invitation rows: name, email, creation time, admission state and actual mail delivery state |
| `/api/admin/spend` | Aggregate rolling 24-hour call count, spend in US cents, configured total cap or null |
| `/api/admin/health` | Allowlisted fields from the deployed static version record, or null when unavailable |

Invites default to 30 rows, cap at 100, and return `next: {before, after}` for the next request's
query parameters. Equal creation times are ordered by email so no invitation is lost between pages.
Names and addresses are administrator-only. No mail body, signing token, secret, individual AI prompt
or private library is returned. Admission and email delivery are separate states; admitted does not
mean sent. Sharing disabled or missing invitation storage returns a setup-unavailable response.

All endpoints are read-only. A write returns 405 and changes nothing. Resend and revoke controls are
not invented before their server behavior exists. Existing invitation sending remains the existing
authorized social API, with its existing mail and Access checks.

The route uses the project's existing JWT verification rather than a new identity mechanism. Relevant
Cloudflare guidance: https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/ .
