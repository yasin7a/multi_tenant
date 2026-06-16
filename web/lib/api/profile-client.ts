import { getClientApiBase } from "@/lib/api-origin";
import type { Me } from "@/types";

export async function updateProfile(
  form: FormData,
): Promise<Me & { redirectUrl?: string }> {
  const res = await fetch(`${getClientApiBase()}/api/profile`, {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Update failed");
  return data as Me & { redirectUrl?: string };
}
