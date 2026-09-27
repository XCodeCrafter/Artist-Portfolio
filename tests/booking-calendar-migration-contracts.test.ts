import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
const migration = readFileSync(new URL("../supabase/migrations/0053_booking_calendar.sql", import.meta.url), "utf8");
const checks = readFileSync(new URL("../supabase/checks/0053_booking_calendar.sql", import.meta.url), "utf8");
const runtime = readFileSync(new URL("../scripts/test-booking-calendar-migration.mjs", import.meta.url), "utf8");
describe("Booking calendar migration security contract", () => {
  it("adds a disabled private singleton without modifying existing content/inquiries", () => {
    expect(migration).toContain('"enabled":false'); expect(migration).toContain('"events":[]');
    expect(migration).toContain("alter table public.booking_calendar enable row level security");
    expect(migration).toContain("revoke all on table public.booking_calendar from public, anon, authenticated, service_role");
    expect(migration).not.toMatch(/\b(?:drop|truncate|delete)\b|create policy/i);
    expect(migration).toContain("on conflict (id) do nothing");
  });
  it("binds save to the full collection CAS under a row lock", () => {
    expect(migration).toContain("where id = 'main' for update"); expect(migration).toContain("v_current is distinct from p_expected_updated_at");
    expect(migration).toContain("errcode = '40001'"); expect(migration).toContain("interval '1 microsecond'");
    expect(migration).toContain("public.is_valid_booking_calendar_v2(p_payload)");
  });
  it("uses explicit published fields and never exposes private rows", () => {
    const projection = migration.slice(migration.indexOf("create or replace function public.get_public_booking_calendar_v1"), migration.indexOf("revoke all on function public.get_booking_calendar_v2_snapshot"));
    expect(projection).toContain("where item->'published' = 'true'::jsonb");
    expect(projection).toContain("calendar.draft->'settings'->'enabled' = 'true'::jsonb");
    expect(projection).not.toContain("updatedAt"); expect(projection).not.toContain("'draft'");
    expect(projection).not.toMatch(/\b(?:update|insert|delete|execute)\b/i);
  });
  it("keeps helpers and writes private, read-only projection public, and all search paths fixed", () => {
    expect(migration).toContain("grant execute on function public.get_booking_calendar_v2_snapshot() to service_role");
    expect(migration).toContain("grant execute on function public.save_booking_calendar_v2(timestamptz,jsonb) to service_role");
    expect(migration).toContain("grant execute on function public.get_public_booking_calendar_v1() to anon, authenticated, service_role");
    expect(migration).not.toContain("grant execute on function public.is_valid_booking_calendar_v2");
    expect(migration.match(/set search_path = ''/g)).toHaveLength(4);
    expect(checks).not.toMatch(/^\s*(?:insert|update|delete|alter|create)\b/im);
  });
  it("includes real isolated PostgreSQL permission, CAS, validation and rerun verification", () => {
    for (const marker of ["new PGlite()", "42501", "40001", "22023", "PRIVATE DRAFT", "beforeRerun", "begin read only"]) expect(runtime).toContain(marker);
    expect(runtime).not.toContain("process.env");
  });
});
