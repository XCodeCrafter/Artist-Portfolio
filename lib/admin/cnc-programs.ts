import "server-only";

import {
  CNC_DIALECTS,
  type CncDialect,
  type CncProgramRecord,
} from "@/lib/cnc-code";
import { createAdminServiceClient, hasAdminServiceEnv } from "@/lib/admin/service";
import { CNC_PROGRAMS } from "@/lib/content/cnc-programs";

type CncProgramRow = {
  id: string;
  file_name: string;
  title: string;
  description: string;
  dialect: string;
  source_code: string;
  preview_line_count: number;
  sort_order: number;
  is_published: boolean;
  updated_at: string;
};

export type EditableCncProgram = CncProgramRecord & {
  updatedAt: string;
};

export type EditableCncProgramsResult = {
  programs: EditableCncProgram[];
  isConfigured: boolean;
  migrationRequired: boolean;
  loadError?: string;
};

function normalizeDialect(value: string): CncDialect {
  return CNC_DIALECTS.includes(value as CncDialect)
    ? (value as CncDialect)
    : "siemens";
}

function mapProgram(row: CncProgramRow): EditableCncProgram {
  return {
    id: row.id,
    fileName: row.file_name,
    title: row.title,
    description: row.description,
    dialect: normalizeDialect(row.dialect),
    source: row.source_code,
    previewLineCount: row.preview_line_count,
    sortOrder: row.sort_order,
    isPublished: row.is_published,
    updatedAt: row.updated_at,
  };
}

function fallbackPrograms(): EditableCncProgram[] {
  return CNC_PROGRAMS.map((program, index) => ({
    ...program,
    sortOrder: (index + 1) * 10,
    isPublished: true,
    updatedAt: "1970-01-01T00:00:00.000Z",
  }));
}

function isMissingCncSchema(error: { code?: string; message?: string } | null) {
  const message = error?.message?.toLowerCase() || "";
  return (
    error?.code === "42P01" ||
    error?.code === "PGRST205" ||
    (/relation .*cnc_programs/.test(message) && message.includes("does not exist")) ||
    (message.includes("could not find the table") &&
      message.includes("cnc_programs") &&
      message.includes("schema cache"))
  );
}

export async function getEditableCncPrograms(): Promise<EditableCncProgramsResult> {
  if (!hasAdminServiceEnv()) {
    return {
      programs: fallbackPrograms(),
      isConfigured: false,
      migrationRequired: false,
    };
  }

  const supabase = createAdminServiceClient();
  if (!supabase) {
    return {
      programs: fallbackPrograms(),
      isConfigured: false,
      migrationRequired: false,
    };
  }

  const result = await supabase
    .from("cnc_programs")
    .select(
      "id,file_name,title,description,dialect,source_code,preview_line_count,sort_order,is_published,updated_at"
    )
    .order("sort_order", { ascending: true })
    .order("id", { ascending: true })
    .returns<CncProgramRow[]>();

  if (result.error) {
    if (isMissingCncSchema(result.error)) {
      return {
        programs: [],
        isConfigured: true,
        migrationRequired: true,
      };
    }

    console.error("Unable to load editable CNC programs.", result.error);
    return {
      programs: [],
      isConfigured: true,
      migrationRequired: false,
      loadError: "Unable to load CNC programs from Supabase.",
    };
  }

  return {
    programs: (result.data ?? []).map(mapProgram),
    isConfigured: true,
    migrationRequired: false,
  };
}
