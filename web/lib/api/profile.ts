import type { Me, PublicProfile } from "@/types";

export async function getPublicProfile(origin: string, host: string) {
  const res = await fetch(`${origin}/api/profile/public`, {
    headers: { host },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicProfile;
}

export async function getMe(origin: string, host: string, cookie?: string | null) {
  if (!cookie) return null;
  const res = await fetch(`${origin}/api/profile/me`, {
    headers: { host, cookie, accept: "application/json" },
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as Me;
}

export async function updateProfile(form: FormData) {
  const res = await fetch("/api/profile", {
    method: "POST",
    credentials: "include",
    body: form,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data?.error || "Update failed");
  return data as Me & { redirectUrl?: string };
}
