"use client";

import { useState } from "react";
import { getClientApiBase } from "@/lib/api-origin";

type Props = {
  className?: string;
  children?: React.ReactNode;
  redirectTo?: string;
};

export default function LogoutButton({
  className,
  children = "Logout",
  redirectTo = "/login",
}: Props) {
  const [loading, setLoading] = useState(false);

  async function onClick() {
    if (loading) return;
    setLoading(true);
    try {
      await fetch(`${getClientApiBase()}/api/auth/logout`, {
        method: "POST",
        credentials: "include",
      });
    } finally {
      window.location.href = redirectTo;
    }
  }

  return (
    <button
      type="button"
      className={className}
      onClick={onClick}
      disabled={loading}
    >
      {loading ? "Logging out…" : children}
    </button>
  );
}
