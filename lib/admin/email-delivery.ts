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
