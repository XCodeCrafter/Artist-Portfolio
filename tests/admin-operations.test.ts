import { describe, expect, it } from "vitest";
import {
  getResendDeliveryStatus,
  RESEND_DELIVERY_STATUS,
} from "../lib/admin/email-delivery";
import {
  formatBytes,
  getMediaKind,
  getMediaSizeLimit,
  MAX_IMAGE_BYTES,
  MAX_VIDEO_BYTES,
} from "../lib/admin/media";
import { SECURITY_EVENT_ACTIONS } from "../lib/admin/security";

describe("email delivery mapping", () => {
  it("maps provider events to the supported delivery states", () => {
    expect(getResendDeliveryStatus("email.delivered")).toBe("delivered");
    expect(getResendDeliveryStatus("email.bounced")).toBe("bounced");
    expect(getResendDeliveryStatus("email.scheduled")).toBe("pending");
    expect(getResendDeliveryStatus("email.opened")).toBeUndefined();
    expect(Object.values(RESEND_DELIVERY_STATUS)).toContain("suppressed");
  });

  it("surfaces delivery tracking gaps as operations security events", () => {
    expect(SECURITY_EVENT_ACTIONS).toContain("booking_email_tracking_failed");
    expect(SECURITY_EVENT_ACTIONS).toContain(
      "booking_email_webhook_unmatched"
    );
  });
});

describe("media upload limits", () => {
  it("recognizes supported media and applies the right size limit", () => {
    expect(getMediaKind("image/webp")).toBe("image");
    expect(getMediaKind("video/mp4")).toBe("video");
    expect(getMediaKind("application/pdf")).toBeNull();
    expect(getMediaSizeLimit("image/jpeg")).toBe(MAX_IMAGE_BYTES);
    expect(getMediaSizeLimit("video/webm")).toBe(MAX_VIDEO_BYTES);
  });

  it("formats byte totals for the admin UI", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5 MB");
  });
});
