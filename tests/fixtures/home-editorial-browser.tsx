import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import { PathnameContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import HomeEditor from "@/components/admin/v2/HomeEditor";
import HomePreviewRuntime from "@/components/admin/v2/HomePreviewRuntime";
import HomePageView from "@/components/home/HomePageView";
import TopNav from "@/components/TopNav";
import GalleryFooter from "@/components/GalleryFooter";
import FooterContentProvider from "@/components/FooterContentProvider";
import PrivacyProvider from "@/components/privacy/PrivacyProvider";
import { FALLBACK_CONTENT } from "@/lib/content/fallback";
import { getVisiblePublicPageNavigationItems } from "@/lib/content/navigation";
import { getFontFamily } from "@/lib/content/fonts";
import type { MediaAsset } from "@/lib/admin/media";
import { createFullHomeFixtureDraft, readFixtureHome, setFixtureConflict } from "./home-editorial-actions";

const settings = FALLBACK_CONTENT.settings;
const navigationItems = getVisiblePublicPageNavigationItems(FALLBACK_CONTENT.navigation.items, {
  hasPublishedCncPrograms: false, hasResumeContent: false,
});
// Use the project's configured stacks. With no bundled fonts, local installed
// fonts / the declared fallbacks are intentional; the fixture never fetches fonts.
for (const [variable, font] of Object.entries({ "--font-display": settings.displayFont, "--font-body": settings.bodyFont, "--font-ui": settings.uiFont })) {
  document.documentElement.style.setProperty(variable, getFontFamily(font));
}

const assets: MediaAsset[] = ["guitar", "studio", "press", "live"].map((name, index) => ({
  id: `fixture-${name}`, label: `QA ${name} photo`, src: `/images/home-editorial/${name}.webp`, alt: `AI-generated ${name} placeholder`,
  mediaType: "image", usageKey: "", sortOrder: index, isPublished: true, storageBucket: "", storagePath: "", fileSize: 0,
  mimeType: "image/webp", metadata: {}, createdAt: "", updatedAt: "", deletedAt: "", deletedBy: "",
}));

function Fixture() {
  const [snapshot, setSnapshot] = useState(readFixtureHome);
  const [mode, setMode] = useState("full");
  const [revision, setRevision] = useState(0);
  const [conflict, setConflict] = useState(false);
  const [transitions, setTransitions] = useState(false);
  function reload() { setSnapshot(readFixtureHome()); setRevision(value => value + 1); }
  const controls = <header className="fixture-controls grid gap-3 rounded-2xl border border-white/20 bg-[#111] p-4">
      <h1 className="font-ui text-xl">Home editorial sections · isolated UI QA</h1>
      <p className="text-sm text-white/65">Actual public and admin components, existing local Home photographs and temporary AI imagery. Release and press text are explicitly synthetic. Saves stay in memory. No database, credentials or external requests. The audio sample is eight seconds of silence. Typography uses the configured font stacks with local fallbacks.</p>
      <div className="flex flex-wrap items-center gap-4">
        <label>QA view <select aria-label="QA view" className="ml-2 rounded-lg bg-black p-2" value={mode} onChange={event => { reload(); setMode(event.target.value); }}><option value="full">Full Home · navigation to footer</option><option value="public">Public Home · editorial sections only</option><option value="admin">Home admin editor</option><option value="migration">Migration missing</option></select></label>
        <label><input type="checkbox" checked={conflict} onChange={event => { setConflict(event.target.checked); setFixtureConflict(event.target.checked); }} /> Simulate version conflict</label>
        <label><input type="checkbox" checked={transitions} onChange={event => setTransitions(event.target.checked)} /> Dark section transitions</label>
        <button type="button" className="rounded-lg border border-white/30 px-4 py-2" onClick={reload}>Reload saved test state</button>
      </div>
    </header>;
  return <PathnameContext.Provider value={mode === "admin" || mode === "migration" ? "/admin/v2/pages/home" : "/"}>
    <PrivacyProvider><FooterContentProvider content={settings.footerContent}>
    <div className={mode === "full" ? "fixture-full" : mode === "public" ? "fixture-public" : "mx-auto max-w-[1720px] p-4 md:p-7"}>
    {mode === "full" ? <details className="fixture-qa-disclosure">
      <summary>Isolated preview · QA controls</summary>{controls}
    </details> : <div className="m-4">{controls}</div>}
    {mode === "full" ? <>
      <div aria-hidden="true" className="pointer-events-none fixed inset-0 z-0 opacity-60 noise" />
      <TopNav artistName={settings.artistName} navigationItems={navigationItems} socialLinks={FALLBACK_CONTENT.socialLinks} />
      <div className="home-page relative z-10" data-home-transitions={transitions ? "on" : undefined}>
        <HomePageView key={revision} data={createFullHomeFixtureDraft(snapshot.draft)} programs={[]} sectionTransitionsEnabled={transitions} />
        <GalleryFooter artistName={settings.artistName} contactBlurb={settings.contactBlurb} location={settings.location}
          footerEffect={settings.footerEffect} socialLinks={FALLBACK_CONTENT.socialLinks} tagline={settings.tagline} />
      </div>
    </> : mode === "public" ? <HomePageView key={revision} data={snapshot.draft} programs={[]} sectionTransitionsEnabled={transitions} />
      : <HomeEditor key={revision} assets={assets} snapshot={mode === "migration" ? { ...snapshot, editorialAvailable: undefined } : snapshot} disabled={mode === "migration"} migrationRequired={mode === "migration"} />}
    </div>
    </FooterContentProvider></PrivacyProvider>
  </PathnameContext.Provider>;
}

const container = document.getElementById("fixture-root");
if (!container) throw new Error("Missing isolated Home fixture root");
createRoot(container).render(<ImageConfigContext.Provider value={{ ...imageConfigDefault, unoptimized: true }}>
  {window.location.pathname === "/admin/v2-preview/home" ? <HomePreviewRuntime initialSnapshot={readFixtureHome()} programs={[]} /> : <Fixture />}
</ImageConfigContext.Provider>);
