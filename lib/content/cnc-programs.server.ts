import "server-only";

import { cache } from "react";
import {
  CNC_DIALECTS,
  type CncDialect,
  type CncProgramDefinition,
} from "@/lib/cnc-code";
import { CNC_PROGRAMS } from "@/lib/content/cnc-programs";
import { createPublicContentClient } from "@/lib/content/supabase";

type CncProgramRow = {
  id: string;
  file_name: string;
  title: string;
  description: string;
  dialect: string;
  source_code: string;
  preview_line_count: number;
};

function normalizeDialect(value: string): CncDialect {
  return CNC_DIALECTS.includes(value as CncDialect)
    ? (value as CncDialect)
    : "siemens";
}

function mapProgram(row: CncProgramRow): CncProgramDefinition {
  return {
    id: row.id,
    fileName: row.file_name,
    title: row.title,
    description: row.description,
    dialect: normalizeDialect(row.dialect),
    source: row.source_code,
    previewLineCount: row.preview_line_count,
  };
}

function developmentFallback(): CncProgramDefinition[] {
  return process.env.NODE_ENV === "production"
    ? []
    : CNC_PROGRAMS.map((program) => ({ ...program }));
}

function clonedFallback(): CncProgramDefinition[] {
  return CNC_PROGRAMS.map((program) => ({ ...program }));
}

function isMissingCncSchema(error: { code?: string; message?: string }) {
  const message = error.message?.toLowerCase() || "";
  return (
    error.code === "42P01" ||
    error.code === "PGRST205" ||
    (/relation .*cnc_programs/.test(message) && message.includes("does not exist")) ||
    (message.includes("could not find the table") &&
      message.includes("cnc_programs") &&
      message.includes("schema cache"))
  );
}

/**
 * CNC programs are intentionally loaded only by HOME. Long source files do not
 * belong in the shared portfolio payload used by every page and metadata call.
 */
export const getPublishedCncPrograms = cache(
  async (): Promise<CncProgramDefinition[]> => {
    const supabase = createPublicContentClient();
    if (!supabase) return developmentFallback();

    const result = await supabase
      .from("cnc_programs")
      .select(
        "id,file_name,title,description,dialect,source_code,preview_line_count"
      )
      .eq("is_published", true)
      .order("sort_order", { ascending: true })
      .order("id", { ascending: true })
      .limit(3)
      .returns<CncProgramRow[]>();

    if (result.error) {
      if (isMissingCncSchema(result.error)) return clonedFallback();

      console.error("Unable to load published CNC programs.", result.error);
      return developmentFallback();
    }

    return (result.data ?? []).map(mapProgram);
  }
);

/** Lightweight availability probe for the shared navbar. */
export const hasPublishedCncPrograms = cache(async (): Promise<boolean> => {
  const supabase = createPublicContentClient();
  if (!supabase) return developmentFallback().length > 0;

  const result = await supabase
    .from("cnc_programs")
    .select("id")
    .eq("is_published", true)
    .limit(1);

  if (result.error) {
    if (isMissingCncSchema(result.error)) return clonedFallback().length > 0;

    console.error("Unable to check published CNC programs.", result.error);
    return false;
  }

  return Boolean(result.data?.length);
});
