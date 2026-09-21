"use server";

import {
  deleteInquiryOnSurface,
  updateInquiryOnSurface,
} from "@/lib/admin/inquiry-actions";

// Destinations belong to these server-owned entrypoints, never to a submitted
// return URL. The underlying core owns authentication, origin checks and CAS.
export async function updateClassicInquiry(formData: FormData) {
  return updateInquiryOnSurface("classic", formData);
}

export async function deleteClassicInquiry(formData: FormData) {
  return deleteInquiryOnSurface("classic", formData);
}

export async function updateV2Inquiry(formData: FormData) {
  return updateInquiryOnSurface("v2", formData);
}

export async function deleteV2Inquiry(formData: FormData) {
  return deleteInquiryOnSurface("v2", formData);
}
