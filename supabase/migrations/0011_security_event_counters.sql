-- Security event counter index.
-- Audit logs store blocked contact, analytics, and admin action attempts
-- with actions starting with `security_`. This keeps the admin security
-- counters fast.

create index if not exists audit_logs_action_created_at_idx
on public.audit_logs (action, created_at desc);
