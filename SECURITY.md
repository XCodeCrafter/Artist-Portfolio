# Security Policy

## Reporting

Report suspected vulnerabilities privately to `xcodecrafter@gmail.com`. Include
the affected route, reproduction steps, and impact. Do not include production
credentials and do not open a public issue before a fix is available.

## Scope

Security fixes target the current production branch. Admin access requires a
Supabase Auth session elevated to `aal2` with TOTP MFA and a matching active
`admin_profiles` row in production. `ADMIN_EMAILS` is only a local-development
fallback. Secrets belong only in the deployment environment and must never be
committed or prefixed with `NEXT_PUBLIC_`.

Production also requires Upstash auth throttling, `AUTH_SECURITY_SECRET`, public
Supabase signup disabled, and migration `0015_admin_auth_hardening.sql` applied.

Before release, run `npm run check` and `npm run audit:prod`, confirm every
readiness check in `/admin`, and verify `/api/health` from the production host.
