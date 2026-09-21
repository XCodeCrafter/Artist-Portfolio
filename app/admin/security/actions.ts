"use server";

import {
  deleteAdminProfile as deleteSharedAdminProfile,
  resetAdminMfa as resetSharedAdminMfa,
  revokeAdminSessions as revokeSharedAdminSessions,
  saveAdminProfile as saveSharedAdminProfile,
} from "@/lib/admin/security-actions";

// Compatibility entrypoints for already-rendered Classic forms. The shared
// actions still validate the allowlisted surface and every authorization guard.
export async function saveAdminProfile(formData: FormData) {
  return saveSharedAdminProfile(formData);
}

export async function deleteAdminProfile(formData: FormData) {
  return deleteSharedAdminProfile(formData);
}

export async function revokeAdminSessions(formData: FormData) {
  return revokeSharedAdminSessions(formData);
}

export async function resetAdminMfa(formData: FormData) {
  return resetSharedAdminMfa(formData);
}
