import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import SiteSharingEditor from "@/components/admin/v2/SiteSharingEditor";
import type { MediaAsset } from "@/lib/admin/media";
import { readSharingFixture, setSharingFixtureMode } from "./site-sharing-actions";

const assets: MediaAsset[] = [
  { id: "fixture-microphone", label: "Microphone cover", src: "/images/home-editorial/press-social.jpg", alt: "Microphone on a road case", mediaType: "image", usageKey: "", sortOrder: 0, isPublished: true, storageBucket: "", storagePath: "", fileSize: 0, mimeType: "image/jpeg", metadata: {}, createdAt: "", updatedAt: "", deletedAt: "", deletedBy: "" },
  { id: "fixture-guitar", label: "Guitarist photograph", src: "/images/about.jpg", alt: "A guitarist performing", mediaType: "image", usageKey: "", sortOrder: 1, isPublished: true, storageBucket: "", storagePath: "", fileSize: 0, mimeType: "image/jpeg", metadata: {}, createdAt: "", updatedAt: "", deletedAt: "", deletedBy: "" },
];
function Fixture() {
  const [snapshot, setSnapshot] = useState(readSharingFixture);
  const [revision, setRevision] = useState(0);
  const [migration, setMigration] = useState(false);
  const [mode, setMode] = useState("success");
  function reload() { setSnapshot(readSharingFixture()); setRevision(value => value + 1); }
  return <main className="mx-auto grid max-w-[1640px] gap-5 p-4 sm:p-7">
    <header className="rounded-2xl border border-white/15 bg-[#101012] p-5">
      <p className="text-xs uppercase tracking-widest text-[#ff806c]">Isolated UI QA · no production changes</p>
      <h1 className="heading-ui mt-3 text-3xl font-semibold">Sharing &amp; SEO</h1>
      <p className="mt-3 text-sm leading-6 text-white/55">Actual admin editor and social-card artwork. Proposed text, local media, in-memory saves. No database, credentials or external requests.</p>
      <div className="mt-4 flex flex-wrap items-center gap-5 text-sm">
        <label>Save response <select className="ml-2 rounded-xl border border-white/20 bg-black p-2" value={mode} onChange={event => { setMode(event.target.value); setSharingFixtureMode(event.target.value as "success" | "conflict" | "lost"); }}><option value="success">Confirmed save</option><option value="conflict">Version conflict</option><option value="lost">Lost response</option></select></label>
        <label><input type="checkbox" className="mr-2" checked={migration} onChange={event => { setMigration(event.target.checked); reload(); }} /> Migration unavailable</label>
        <button type="button" className="min-h-11 rounded-xl border border-white/20 px-4" onClick={reload}>Reload saved test state</button>
      </div>
    </header>
    <SiteSharingEditor key={revision} data={{ snapshot, isConfigured: true, migrationRequired: migration }} assets={assets} artistName="Franky Fugazi" description="Raw blues, original music and live dates." siteUrl="https://artist-portfolio-atol.vercel.app/" />
  </main>;
}
const container = document.getElementById("fixture-root");
if (!container) throw new Error("Missing Sharing fixture root");
createRoot(container).render(<ImageConfigContext.Provider value={{ ...imageConfigDefault, unoptimized: true }}><Fixture /></ImageConfigContext.Provider>);
