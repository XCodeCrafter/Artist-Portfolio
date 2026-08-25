import { NextResponse } from "next/server";
import { Resend } from "resend";
import { writeAuditLog } from "@/lib/admin/audit";
import { getResendDeliveryStatus } from "@/lib/admin/email-delivery";
import { createAdminServiceClient } from "@/lib/admin/service";
import { readTextBodyWithLimit } from "@/lib/security/json-body";

export const runtime = "nodejs";

const MAX_WEBHOOK_BYTES = 64 * 1024;

export async function POST(request: Request) {
  const webhookSecret = process.env.RESEND_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return NextResponse.json(
      { ok: false, error: "Webhook is not configured." },
      { status: 503 }
    );
  }

  const bodyResult = await readTextBodyWithLimit(request, MAX_WEBHOOK_BYTES);
  if (!bodyResult.ok) {
    return NextResponse.json(
      { ok: false },
      { status: bodyResult.status }
    );
  }
  const payload = bodyResult.body;

  const id = request.headers.get("svix-id") || "";
  const timestamp = request.headers.get("svix-timestamp") || "";
  const signature = request.headers.get("svix-signature") || "";
  if (!id || !timestamp || !signature) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  let event: ReturnType<Resend["webhooks"]["verify"]>;
  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    event = resend.webhooks.verify({
      payload,
      headers: { id, timestamp, signature },
      webhookSecret,
    });
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const status = getResendDeliveryStatus(event.type);
  if (!status || !("email_id" in event.data)) {
    return NextResponse.json({ ok: true });
  }

  const eventAt = new Date(event.created_at);
  if (Number.isNaN(eventAt.getTime())) {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const result = await supabase.rpc("record_booking_email_delivery", {
    p_resend_email_id: event.data.email_id,
    p_email_status: status,
    p_event_at: eventAt.toISOString(),
    p_webhook_id: id,
  });

  if (result.error) {
    console.error(result.error);
    return NextResponse.json({ ok: false }, { status: 503 });
  }

  const delivery = (result.data as Array<{
    inquiry_id: string;
    applied: boolean;
  }> | null)?.[0];

  if (!delivery) {
    await writeAuditLog({
      action: "booking_email_webhook_unmatched",
      tableName: "booking_inquiries",
      recordId: id,
      metadata: {
        provider: "resend",
        providerEventAt: eventAt.toISOString(),
        status,
        webhookId: id,
      },
    });
  } else if (delivery.applied) {
    await writeAuditLog({
      action: `booking_email_${status}`,
      tableName: "booking_inquiries",
      recordId: delivery.inquiry_id,
      metadata: {
        provider: "resend",
        providerEventAt: eventAt.toISOString(),
        webhookId: id,
      },
    });
  }

  return NextResponse.json({ ok: true });
}
