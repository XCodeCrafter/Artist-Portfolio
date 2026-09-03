import { readFileSync } from "node:fs";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import ContactPreviewFrame, {
  CONTACT_PREVIEW_VIEWPORTS,
} from "@/components/admin/v2/ContactPreviewFrame";
import { CONTACT_PREVIEW_READY_MESSAGE } from "@/components/admin/v2/ContactPreviewRuntime";
import ContactPageView, {
  CONTACT_PREVIEW_SELECTION_MESSAGE,
} from "@/components/contact/ContactPageView";
import {
  CONTACT_PREVIEW_UPDATE_MESSAGE,
  parseContactPreviewUpdateMessage,
  type ContactEditorDraft,
} from "@/lib/admin/contact-editor";

const draft: ContactEditorDraft = {
  hero: {
    title: "CONTACT",
    subtitle: "LET'S WORK TOGETHER",
    ctaLabel: "OPEN FORM",
    ctaHref: "#contact-form",
    backgroundSrc: "/uploads/contact-hero.mp4",
    posterSrc: "/images/booking-hero.jpg",
    mediaType: "video",
  },
  details: {
    location: "Prague / Worldwide",
    contactBlurb: "For acting, music, and creative collaborations.",
  },
};

const frameSource = readFileSync(
  new URL("../components/admin/v2/ContactPreviewFrame.tsx", import.meta.url),
  "utf8"
);
const runtimeSource = readFileSync(
  new URL("../components/admin/v2/ContactPreviewRuntime.tsx", import.meta.url),
  "utf8"
);
const proxySource = readFileSync(new URL("../proxy.ts", import.meta.url), "utf8");

describe("Admin V2 Contact preview", () => {
  it("renders selectable Hero and Contact regions while keeping the real form inert", () => {
    const preview = renderToStaticMarkup(
      <ContactPageView
        data={draft}
        mode="preview"
        onSelectSection={vi.fn()}
        selectedSection="details"
      />
    );
    const publicPage = renderToStaticMarkup(<ContactPageView data={draft} />);

    expect(preview).toContain('data-contact-preview-section="hero"');
    expect(preview).toContain('data-contact-preview-section="details"');
    expect(preview).toContain('aria-label="Edit Hero"');
    expect(preview).toContain('aria-label="Edit Contact &amp; form"');
    expect(preview).toContain("inert");
    expect(preview).toContain('id="contact-form"');
    expect(preview).not.toContain("<video");

    expect(publicPage).not.toContain("data-contact-preview-section");
    expect(publicPage).not.toContain("inert");
    expect(publicPage).toContain('id="contact-form"');
    expect(publicPage).toContain("<video");
  });

  it("accepts only a strict, section-scoped preview update", () => {
    const message = {
      type: CONTACT_PREVIEW_UPDATE_MESSAGE,
      draft,
      focusRequestId: 2,
      selectedSection: "details",
    } as const;

    expect(parseContactPreviewUpdateMessage(message)).toEqual(message);
    expect(
      parseContactPreviewUpdateMessage({
        ...message,
        selectedSection: "inbox",
      })
    ).toBeNull();
    expect(
      parseContactPreviewUpdateMessage({ ...message, unexpected: true })
    ).toBeNull();
  });

  it("uses exact origin and window-source guards for ready, update, and selection messages", () => {
    expect(CONTACT_PREVIEW_READY_MESSAGE).toBe("contact-preview-ready");
    expect(CONTACT_PREVIEW_UPDATE_MESSAGE).toBe("contact-preview-update");
    expect(CONTACT_PREVIEW_SELECTION_MESSAGE).toBe(
      "contact-preview-section-select"
    );

    expect(frameSource).toContain(
      "event.origin !== window.location.origin"
    );
    expect(frameSource).toContain(
      "event.source !== frameRef.current?.contentWindow"
    );
    expect(frameSource).toContain(
      "event.data.type === CONTACT_PREVIEW_READY_MESSAGE"
    );
    expect(frameSource).toContain("if (!isSelectionMessage(event.data)) return;");
    expect(runtimeSource).toContain(
      "event.origin !== window.location.origin"
    );
    expect(runtimeSource).toContain("event.source !== window.parent");
    expect(runtimeSource).toContain("parseContactPreviewUpdateMessage(event.data)");
    expect(runtimeSource).toContain("{ type: CONTACT_PREVIEW_READY_MESSAGE }");
    expect(runtimeSource).toContain(
      "{ type: CONTACT_PREVIEW_SELECTION_MESSAGE, section }"
    );
    expect(frameSource).not.toMatch(/postMessage\([\s\S]{0,160},\s*["']\*["']/);
    expect(runtimeSource).not.toMatch(
      /postMessage\([\s\S]{0,160},\s*["']\*["']/
    );
  });

  it("keeps the iframe on the authenticated Contact preview route and fixed device sizes", () => {
    const markup = renderToStaticMarkup(
      <ContactPreviewFrame
        device="mobile"
        draft={draft}
        focusRequestId={1}
        isLive={false}
        onSelectSection={vi.fn()}
        selectedSection="hero"
      />
    );

    expect(CONTACT_PREVIEW_VIEWPORTS).toEqual({
      desktop: { width: 1440, height: 900 },
      mobile: { width: 390, height: 844 },
    });
    expect(markup).toContain('src="/admin/v2-preview/contact"');
    expect(markup).toContain("Contact page mobile preview");
    expect(markup).toContain("390px");
    expect(markup).toContain("844px");
    expect(markup).toContain("Review-only preview");
  });

  it("allows framing only for the exact Contact preview paths", () => {
    expect(proxySource).toContain('"/admin/v2-preview/contact"');
    expect(proxySource).toContain('"/admin/v2-preview/contact/"');
    expect(proxySource).toContain(
      "const allowSameOriginFraming = previewRoutes.has(request.nextUrl.pathname)"
    );
    expect(proxySource).toContain(
      'allowSameOriginFraming ? "SAMEORIGIN" : "DENY"'
    );
    expect(proxySource).not.toContain(
      'request.nextUrl.pathname.startsWith("/admin/v2-preview")'
    );
  });
});
