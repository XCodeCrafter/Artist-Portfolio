import { SOCIAL_CARD_BACKGROUND } from "@/lib/site-sharing-preview";

/** Shared DOM / ImageResponse artwork. No remote fetches or scripts. */
export default function SocialPreviewCard({
  brandName,
  title,
  backgroundSrc = SOCIAL_CARD_BACKGROUND,
  siteLabel = "OFFICIAL WEBSITE",
}: {
  brandName: string;
  title: string;
  backgroundSrc?: string;
  siteLabel?: string;
}) {
  return (
    <div style={{ width: 1200, height: 630, display: "flex", position: "relative", overflow: "hidden", background: "#080808", color: "#f4f1ec", fontFamily: "sans-serif" }}>
      {/* ImageResponse needs an actual img, not Next's optimized browser image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={backgroundSrc} alt="" width={1200} height={630} style={{ position: "absolute", inset: 0, width: 1200, height: 630, objectFit: "cover" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(90deg, rgba(5,5,5,0.96) 0%, rgba(5,5,5,0.90) 32%, rgba(5,5,5,0.42) 68%, rgba(5,5,5,0.08) 100%)" }} />
      <div style={{ position: "absolute", inset: 0, background: "linear-gradient(0deg, rgba(5,5,5,0.94) 0%, transparent 45%)" }} />
      <div style={{ display: "flex", flexDirection: "column", justifyContent: "space-between", position: "relative", width: "100%", padding: "62px 68px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20, color: "#ff4b2b", fontSize: 17, letterSpacing: 4 }}>
          <span>{siteLabel}</span>
          <div style={{ width: 58, height: 2, background: "#ff4b2b" }} />
        </div>
        <div style={{ display: "flex", width: 780, fontSize: title.length > 90 ? 48 : title.length > 50 ? 60 : 78, fontWeight: 700, lineHeight: 1.08, letterSpacing: -2, overflowWrap: "break-word" }}>
          {title}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 22 }}>
          <div style={{ width: "100%", height: 1, background: "rgba(255,255,255,0.20)" }} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontSize: 21, letterSpacing: 4, textTransform: "uppercase", maxWidth: 980, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis" }}>{brandName}</span>
            <span style={{ color: "#ff4b2b", fontSize: 32 }}>↗</span>
          </div>
        </div>
      </div>
    </div>
  );
}
