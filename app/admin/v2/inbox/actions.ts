"use server";

import {
  deleteV2Inquiry,
  updateV2Inquiry,
} from "@/lib/admin/inquiry-server-actions";

export async function updateInquiry(formData: FormData) {
  return updateV2Inquiry(formData);
}

export async function deleteInquiry(formData: FormData) {
  return deleteV2Inquiry(formData);
}
