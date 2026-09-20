"use client";

export default function VersionedDraftNotice({ onReload }: { onReload: () => void }) {
  return (
    <aside className="mb-4 rounded-xl border border-amber-300/20 bg-amber-300/5 p-4 text-xs leading-5 text-amber-100/80">
      <p>The saved version changed. Your form still contains its original draft and cannot overwrite newer changes.</p>
      <button
        className="mt-3 min-h-10 rounded-lg border border-amber-200/20 px-3 font-semibold text-amber-100 hover:bg-amber-200/10"
        onClick={() => {
          if (window.confirm("Load the latest saved values? Unsaved changes in this form will be replaced.")) onReload();
        }}
        type="button"
      >
        Load latest saved version
      </button>
    </aside>
  );
}
