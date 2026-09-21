"use server";

import {
  deleteClassicInquiry,
  updateClassicInquiry,
} from "@/lib/admin/inquiry-server-actions";

export async function updateInquiry(formData: FormData) {
  return updateClassicInquiry(formData);
}

export async function deleteInquiry(formData: FormData) {
  return deleteClassicInquiry(formData);
}
