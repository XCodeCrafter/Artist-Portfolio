import { ImageResponse } from "next/og";
import { getPortfolioContent } from "@/lib/content";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default async function OpenGraphImage() {
  const content = await getPortfolioContent();
  const artistName = content.settings.artistName;
  const portfolioLabel =
    content.settings.portfolioType === "actor"
      ? "Actor / Gallery / Showreel"
      : "Music / Video / Booking";

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "flex-end",
          padding: 72,
          background:
            "radial-gradient(circle at 20% 10%, rgba(255,255,255,0.08), transparent 40%), radial-gradient(circle at 80% 30%, rgba(255,255,255,0.06), transparent 45%), linear-gradient(180deg, rgba(255,59,31,0.18), transparent 55%, rgba(184,0,26,0.16)), #050505",
          color: "#fff",
        }}
      >
        <div style={{ fontSize: 18, letterSpacing: 8, opacity: 0.75 }}>
          ARTIST PORTFOLIO
        </div>
        <div style={{ fontSize: 70, fontWeight: 700, marginTop: 18 }}>
          {artistName}
        </div>
        <div style={{ fontSize: 26, opacity: 0.8, marginTop: 16, maxWidth: 900 }}>
          {content.settings.description}
        </div>
        <div style={{ marginTop: 30, fontSize: 18, opacity: 0.65, letterSpacing: 2 }}>
          {portfolioLabel}
        </div>
      </div>
    ),
    size
  );
}
