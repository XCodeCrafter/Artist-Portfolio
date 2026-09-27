import { useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import ImageKitOperationsPanel, { type ImageKitOperationsCallbacks } from "@/components/admin/v2/ImageKitOperationsPanel";
import type { ImageKitObservationOutcome, ImageKitObservationSetupCode } from "@/lib/admin/imagekit-operations-types";
import { operationsSnapshot, outcomeCodes, overviewCases, setupCodes, type OverviewCase } from "./imagekit-operations-scenarios";

type Scenario = {
  setup: ImageKitObservationSetupCode;
  outcome: ImageKitObservationOutcome["code"];
  overview: OverviewCase;
  refreshFailure: boolean;
};
const initialScenario: Scenario = { setup: "configuration-required", outcome: "absent", overview: "mixed", refreshFailure: false };
const localDelay = () => new Promise<void>(resolve => setTimeout(resolve, 450));

function Fixture() {
  const [selected, setSelected] = useState<Scenario>(initialScenario);
  const [applied, setApplied] = useState<Scenario>(initialScenario);
  const [panelVersion, setPanelVersion] = useState(0);
  const [refreshCalls, setRefreshCalls] = useState(0);
  const [observeCalls, setObserveCalls] = useState(0);
  const [draft, setDraft] = useState("Synthetic unsaved caption — keep me.");
  const initial = useMemo(() => operationsSnapshot(applied.setup, applied.overview), [applied]);
  const operations = useMemo<ImageKitOperationsCallbacks>(() => {
    let refreshSequence = 0;
    return {
      refresh: async () => {
        setRefreshCalls(value => value + 1);
        await localDelay();
        if (applied.refreshFailure) return { ok: false, code: "unavailable" };
        return { ok: true, snapshot: operationsSnapshot(applied.setup, applied.overview, ++refreshSequence) };
      },
      observe: async () => {
        setObserveCalls(value => value + 1);
        await localDelay();
        return { code: applied.outcome };
      },
    };
  }, [applied]);

  return <main className="fixture-shell">
    <header className="fixture-intro">
      <h1>ImageKit operations · isolated interactive QA</h1>
      <p>Actual operations panel and project CSS, with synthetic local responses. This is not the Media editor. No credentials, authentication, database, upload, provider access or save endpoint exists here.</p>
      <p>Choose a scenario and press Apply scenario to reset only the panel. Refresh and Check use a short local delay so pending and double-click protection can be tested. Nothing runs automatically.</p>
    </header>
    <section aria-label="Synthetic fixture controls" className="fixture-controls">
      <label>Setup scenario
        <select value={selected.setup} onChange={event => setSelected(value => ({ ...value, setup: event.target.value as Scenario["setup"] }))}>
          {setupCodes.map(code => <option key={code} value={code}>{code}</option>)}
        </select>
      </label>
      <label>Next check result
        <select value={selected.outcome} onChange={event => setSelected(value => ({ ...value, outcome: event.target.value as Scenario["outcome"] }))}>
          {outcomeCodes.map(code => <option key={code} value={code}>{code}</option>)}
        </select>
      </label>
      <label>Upload overview
        <select value={selected.overview} onChange={event => setSelected(value => ({ ...value, overview: event.target.value as OverviewCase }))}>
          {overviewCases.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </label>
      <div className="fixture-wide">
        <label className="fixture-check"><input type="checkbox" checked={selected.refreshFailure}
          onChange={event => setSelected(value => ({ ...value, refreshFailure: event.target.checked }))} />Simulate refresh failure</label>
        <button type="button" onClick={() => { setApplied({ ...selected }); setPanelVersion(value => value + 1); }}>Apply scenario</button>
        <output aria-label="Synthetic operation call counters" className="fixture-counters">Refresh calls: {refreshCalls} · Check calls: {observeCalls} · Panel resets: {panelVersion}</output>
      </div>
    </section>
    <section aria-label="Unrelated synthetic editor draft" className="fixture-draft">
      <label>Unsaved media caption
        <input value={draft} onChange={event => setDraft(event.target.value)} />
      </label>
      <p>This local draft and both counters must survive panel refreshes and checks. It cannot be saved.</p>
    </section>
    <ImageKitOperationsPanel key={panelVersion} initial={initial} operations={operations} />
  </main>;
}

const container = document.getElementById("fixture-root");
if (!container) throw new Error("Missing isolated fixture root.");
createRoot(container).render(<Fixture />);
