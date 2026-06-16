"use client";

import { useEffect } from "react";

export default function LogoutPage() {
  useEffect(() => {
    fetch("/api/auth/logout", { method: "POST", credentials: "include" }).finally(() => {
      window.location.href = "/login";
    });
  }, []);

  return <p style={{ padding: 24 }}>Logging out…</p>;
}

