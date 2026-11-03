// Identifies notifications with an existing Inbox row, without exposing its ID.
export const BOOKING_EMAIL_SOURCE_TAG = {
  name: "source",
  value: "portfolio_booking",
} as const;

export const RESEND_DELIVERY_STATUS = {
  "email.sent": "sent",
  "email.scheduled": "pending",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
  "email.suppressed": "suppressed",
} as const;

export type EmailDeliveryStatus =
  (typeof RESEND_DELIVERY_STATUS)[keyof typeof RESEND_DELIVERY_STATUS];

export function getResendDeliveryStatus(eventType: string) {
  return RESEND_DELIVERY_STATUS[
    eventType as keyof typeof RESEND_DELIVERY_STATUS
  ];
}
