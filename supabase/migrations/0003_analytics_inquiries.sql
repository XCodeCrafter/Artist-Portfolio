-- Analytics and booking inbox indexes.
-- Run after 0001_initial_schema.sql.

create index if not exists analytics_events_created_at_idx
on public.analytics_events (created_at desc);

create index if not exists analytics_events_name_created_at_idx
on public.analytics_events (event_name, created_at desc);

create index if not exists booking_inquiries_status_created_at_idx
on public.booking_inquiries (status, created_at desc);

create index if not exists booking_inquiries_created_at_idx
on public.booking_inquiries (created_at desc);
