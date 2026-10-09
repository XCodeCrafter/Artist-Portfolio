"use server";

import { saveHomeSectionV2 } from "@/app/admin/v2/pages/home/actions";
import type { HomeSaveState } from "@/lib/admin/home-editor";

/** Reuse the established authentication, media locks and single-row CAS save. */
export async function savePressPageV2(previous: HomeSaveState, formData: FormData): Promise<HomeSaveState> {
  const pressForm = new FormData();
  pressForm.set("section", "press");
  // Preserve duplicate fields so the existing boundary rejects ambiguity.
  for (const key of ["payload", "versions"]) {
    for (const value of formData.getAll(key)) pressForm.append(key, value);
  }
  const result = await saveHomeSectionV2(previous, pressForm);
  return {
    ...result,
    section: "press",
    message: result.message
      .replace("Home changed in another admin session", "Website content changed in another admin session")
      .replaceAll("Home", "Press"),
  };
}
