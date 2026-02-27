//artist-portfolio/app/twitter-image.tsx
import { ImageResponse } from "next/og";

export const runtime = "edge";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function TwitterImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 72,
          background:
            "radial-gradient(circle at 60% 20%, rgba(255,59,31,0.20), transparent 45%), radial-gradient(circle at 20% 80%, rgba(255,255,255,0.07), transparent 55%), #050505",
          color: "#fff",
        }}
      >
        <div style={{ fontSize: 18, letterSpacing: 8, opacity: 0.8 }}>
          FRANKY FUGAZI
        </div>
        <div style={{ fontSize: 74, fontWeight: 800, marginTop: 16 }}>
          Artist Portfolio
        </div>
        <div style={{ fontSize: 26, opacity: 0.8, marginTop: 16, maxWidth: 920 }}>
          Releases, visuals, booking — one link. No fluff. Just vibe.
        </div>
      </div>
    ),
    size
  );
}