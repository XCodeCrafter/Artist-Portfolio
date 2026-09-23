import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ImageConfigContext } from "next/dist/shared/lib/image-config-context.shared-runtime";
import { imageConfigDefault } from "next/dist/shared/lib/image-config";
import PhotoFramingControls from "@/components/admin/v2/PhotoFramingControls";
import FramedImage from "@/components/FramedImage";
import type { HeroFraming, HeroFramingDevice } from "@/lib/content/hero-framing";

const source = "/images/about.jpg";
const viewports = { desktop: { width: 400, height: 500 }, mobile: { width: 350, height: 280 } };

function Placement({ name }: { name: "A" | "B" }) {
  const [framing, setFraming] = useState<HeroFraming | null>(null);
  const [device, setDevice] = useState<HeroFramingDevice>("desktop");
  const [changes, setChanges] = useState(0);
  const viewport = viewports[device];

  return <section aria-label={`Placement ${name}`} className="fixture-placement" data-placement={name}>
    <h2>Placement {name} · same original photo</h2>
    <p className="fixture-caption">Independent local draft. Nothing can be saved or uploaded.</p>
    <PhotoFramingControls value={framing} onChange={next => { setFraming(next); setChanges(count => count + 1); }}
      src={source} saveSection={`fixture ${name} (no save exists)`} device={device} onDeviceChange={setDevice} previewViewport={viewports} />
    <p className="fixture-caption">Selected {device} render · same geometry as the crop editor</p>
    <div className="fixture-image" style={{ aspectRatio: `${viewport.width} / ${viewport.height}` }}>
      <FramedImage src={source} alt={`Selected view for placement ${name}`} fill sizes="450px" className="object-cover" framing={framing} deviceOverride={device} />
    </div>
    <p className="fixture-caption">Responsive public render · desktop above 640 px, mobile below</p>
    <div className="fixture-image fixture-responsive">
      <FramedImage src={source} alt={`Responsive view for placement ${name}`} fill sizes="450px" className="object-cover" framing={framing} />
    </div>
    <p className="fixture-caption" role="status">Placement {name}: {changes} changes · selected {device} · {framing === null ? "Automatic original" : "Custom crop"}</p>
    <output aria-label={`Placement ${name} framing JSON`} className="fixture-json">{JSON.stringify(framing, null, 2)}</output>
  </section>;
}

function Fixture() {
  return <ImageConfigContext.Provider value={{ ...imageConfigDefault, unoptimized: true }}>
    <main className="fixture-shell">
      <header className="fixture-intro">
        <h1>Photo positioning · isolated interactive QA</h1>
        <p>Actual PhotoFramingControls and FramedImage, using one bundled portrait. Two independent placements; no database, credentials, provider, authentication or save endpoint.</p>
        <p>Open “Photo position &amp; zoom” to test Fit whole, zoom, drag, keyboard arrows, mobile and reset. Reload clears this synthetic draft.</p>
      </header>
      <div className="fixture-grid"><Placement name="A" /><Placement name="B" /></div>
    </main>
  </ImageConfigContext.Provider>;
}

const container = document.getElementById("fixture-root");
if (!container) throw new Error("Missing isolated fixture root.");
createRoot(container).render(<Fixture />);
