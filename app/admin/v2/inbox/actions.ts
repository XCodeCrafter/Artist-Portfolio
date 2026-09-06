"use server";

import {
  deleteInquiryOnSurface,
  updateInquiryOnSurface,
} from "@/lib/admin/inquiry-actions";

export async function updateInquiry(formData: FormData) {
  return updateInquiryOnSurface("v2", formData);
}

export async function deleteInquiry(formData: FormData) {
  return deleteInquiryOnSurface("v2", formData);
}
