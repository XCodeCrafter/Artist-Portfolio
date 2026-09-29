// Isolated browser QA only. No environment, production data, server imports or network saves.
import {
  createFallbackHomeEditorSnapshot, parseHomeSectionSubmission,
  type HomeEditorDraft, type HomeEditorSnapshot, type HomeSaveState,
} from "@/lib/admin/home-editor";

export function createHomeFixture(): HomeEditorSnapshot {
  const snapshot = createFallbackHomeEditorSnapshot();
  snapshot.editorialAvailable = true;
  snapshot.photoFramingAvailable = true;
  snapshot.versions.updatedAt = "2026-09-29T10:00:00.000Z";
  snapshot.draft.layout = snapshot.draft.layout.map(item => ({ ...item, enabled: ["release", "work", "press"].includes(item.id) }));
  snapshot.draft.hero = { ...snapshot.draft.hero, backgroundSrc: "/images/home-editorial/guitar.webp", mediaType: "image", posterSrc: "", framing: null };
  snapshot.draft.about = { ...snapshot.draft.about, imageSrc: "/images/home-editorial/studio.webp", framing: null };
  snapshot.draft.feature = { ...snapshot.draft.feature, videoSrc: "/media/hero-loop.mp4", posterSrc: "/images/video-hero.jpg", posterFraming: null };
  snapshot.draft.release = { ...snapshot.draft.release,
    title: "DEMO RELEASE", subtitle: "A sound of its own.", body: "Synthetic QA content — this is not a real release or recording.",
    releaseTitle: "DEMO AUDIO", artist: "SILENT LOCAL TEST CLIP · 8 SECONDS", playback: { kind: "audio", url: "/fixture-audio.wav" },
    primaryLabel: "EXPLORE THE RELEASE", primaryHref: "#home-release",
  };
  snapshot.draft.press.items = [
    { id: "10000000-0000-4000-8000-000000000001", title: "Demo review — not a real endorsement", publication: "SYNTHETIC QA PUBLICATION", quote: "Demonstration quotation only. This text exists to test the reader layout, not to claim a real review.", kind: "review", date: "2026-09-29", href: "#home-press", image: { ...snapshot.draft.work.cards[0].image }, visible: true },
    { id: "10000000-0000-4000-8000-000000000002", title: "Demo interview — fixture only", publication: "SYNTHETIC QA RADIO", quote: "A second clearly labeled demonstration excerpt to test the next and previous controls.", kind: "interview", date: "2026-08-15", href: "", image: { ...snapshot.draft.work.cards[3].image }, visible: true },
    { id: "10000000-0000-4000-8000-000000000003", title: "Hidden QA item", publication: "SYNTHETIC QA", quote: "This should not be rendered in the public reader.", kind: "feature", date: "", href: "", image: { src: "", alt: "", framing: null }, visible: false },
  ];
  snapshot.draft.press.featuredId = snapshot.draft.press.items[0].id;
  return snapshot;
}

/** Full-page composition only: no live content, saved state or visibility is changed. */
export function createFullHomeFixtureDraft(draft: HomeEditorDraft): HomeEditorDraft {
  const result = structuredClone(draft);
  const order = ["hero", "release", "about", "work", "cnc", "feature", "press"] as const;
  result.layout = order.map(id => ({ id, enabled: id !== "cnc" }));
  // Existing local Home photographs keep the old/new section joins representative.
  result.hero = { ...result.hero, backgroundSrc: "/images/hero.jpg", mediaType: "image", posterSrc: "", framing: null };
  result.about = { ...result.about, imageSrc: "/images/about.jpg", framing: null };
  return result;
}

let saved = createHomeFixture();
let simulateConflict = false;
export function readFixtureHome() { return structuredClone(saved); }
export function setFixtureConflict(value: boolean) { simulateConflict = value; }

export async function saveHomeSectionV2(_previous: HomeSaveState, form: FormData): Promise<HomeSaveState> {
  await new Promise(resolve => setTimeout(resolve, 250));
  const eventId = crypto.randomUUID();
  try {
    const parsed = parseHomeSectionSubmission(String(form.get("section")), JSON.parse(String(form.get("payload"))), JSON.parse(String(form.get("versions"))));
    if (!parsed.success) return { status: "invalid", message: "Invalid local test draft.", eventId, fieldErrors: parsed.fieldErrors };
    const { section, payload, versions } = parsed.data;
    if (simulateConflict || versions.updatedAt !== saved.versions.updatedAt) return { status: "conflict", message: "Synthetic version conflict: draft kept; reload saved test state.", eventId, section };
    saved = { ...saved, draft: { ...saved.draft, [section]: payload } as HomeEditorDraft,
      versions: { updatedAt: new Date(Date.parse(saved.versions.updatedAt) + 1000).toISOString() } };
    return { status: "saved", message: "Saved in isolated test memory only.", eventId, section, canonicalSection: payload, versions: saved.versions };
  } catch { return { status: "invalid", message: "Invalid local fixture submission.", eventId }; }
}
