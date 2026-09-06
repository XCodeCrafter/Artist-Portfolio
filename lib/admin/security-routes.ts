export const ADMIN_SECURITY_SURFACE_PATHS = {
  classic: "/admin/security",
  v2: "/admin/v2/security",
} as const;

export type AdminSecuritySurface = keyof typeof ADMIN_SECURITY_SURFACE_PATHS;

export function parseAdminSecuritySurface(
  value: FormDataEntryValue | null | undefined
): AdminSecuritySurface {
  return value === "v2" ? "v2" : "classic";
}

export function getAdminSecurityPath(surface: AdminSecuritySurface) {
  return ADMIN_SECURITY_SURFACE_PATHS[surface];
}
