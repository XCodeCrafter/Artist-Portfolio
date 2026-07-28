-- Remove identifying upload metadata and provide bounded, server-only
-- retention maintenance. This migration deliberately does not schedule a job.

update public.media_assets
set metadata = metadata - 'uploadedBy' - 'originalName'
where metadata ? 'uploadedBy'
   or metadata ? 'originalName';

update public.gallery_presentation
set interlude_meta = 'Portfolio / In progress'
where interlude_meta = 'Amsterdam / 2026 / In progress';

create index if not exists booking_inquiries_status_updated_at_idx
on public.booking_inquiries (status, updated_at);

create index if not exists security_rate_limits_expires_at_idx
on public.security_rate_limits (expires_at);

create or replace function public.cleanup_security_retention(
  p_audit_retention_days integer default 365,
  p_analytics_retention_days integer default 180,
  p_archived_inquiry_retention_days integer default 365,
  p_recovery_retention_days integer default 30,
  p_rate_limit_grace_hours integer default 24
)
returns table (
  audit_logs_deleted bigint,
  analytics_events_deleted bigint,
  archived_inquiries_deleted bigint,
  security_rate_limits_deleted bigint,
  recovery_challenges_deleted bigint
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_audit_retention_days is null
    or p_audit_retention_days not between 1 and 3650
    or p_analytics_retention_days is null
    or p_analytics_retention_days not between 1 and 3650
    or p_archived_inquiry_retention_days is null
    or p_archived_inquiry_retention_days not between 1 and 3650
    or p_recovery_retention_days is null
    or p_recovery_retention_days not between 1 and 365
    or p_rate_limit_grace_hours is null
    or p_rate_limit_grace_hours not between 0 and 168
  then
    raise exception 'invalid security retention parameters'
      using errcode = '22023';
  end if;

  delete from public.audit_logs
  where created_at < v_now - p_audit_retention_days * interval '1 day';
  get diagnostics audit_logs_deleted = row_count;

  delete from public.analytics_events
  where created_at < v_now - p_analytics_retention_days * interval '1 day';
  get diagnostics analytics_events_deleted = row_count;

  delete from public.booking_inquiries
  where status = 'archived'
    and updated_at <
      v_now - p_archived_inquiry_retention_days * interval '1 day';
  get diagnostics archived_inquiries_deleted = row_count;

  delete from public.security_rate_limits
  where expires_at < v_now - p_rate_limit_grace_hours * interval '1 hour';
  get diagnostics security_rate_limits_deleted = row_count;

  delete from public.admin_recovery_challenges
  where expires_at < v_now - p_recovery_retention_days * interval '1 day'
     or used_at < v_now - p_recovery_retention_days * interval '1 day';
  get diagnostics recovery_challenges_deleted = row_count;

  return next;
end;
$$;

revoke all on function public.cleanup_security_retention(
  integer,
  integer,
  integer,
  integer,
  integer
) from public, anon, authenticated;
grant execute on function public.cleanup_security_retention(
  integer,
  integer,
  integer,
  integer,
  integer
) to service_role;

comment on function public.cleanup_security_retention(
  integer,
  integer,
  integer,
  integer,
  integer
) is
  'Service-role-only retention maintenance. Invoke from an external trusted scheduler or maintenance process; this migration creates no cron job.';

comment on column public.media_assets.is_published is
  'Presentation flag only. The portfolio-media bucket remains public, so unpublished or draft assets are not confidential and must not contain secrets.';
