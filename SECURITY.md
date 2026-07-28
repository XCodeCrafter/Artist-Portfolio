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

Production also requires `AUTH_SECURITY_SECRET`, public Supabase signup
disabled, and all migrations through
`0020_rate_limit_security_signals.sql` applied.
Rate limiting is atomic in Supabase PostgreSQL and fails closed in production;
the first denial in each fixed window is recorded for Security Center
monitoring without logging every retry. No separate Redis or Upstash account is
required.

Invoke the service-role-only `cleanup_security_retention(...)` RPC from a
trusted scheduler. The public media bucket is not suitable for confidential
drafts, even when a database row has `is_published=false`.

Before release, run `npm run check` and `npm run audit:prod`, confirm every
readiness check in `/admin`, and verify `/api/health` as a lightweight liveness
endpoint from the production host.
