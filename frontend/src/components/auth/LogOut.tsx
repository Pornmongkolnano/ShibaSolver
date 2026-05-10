"use client";
import { apiFetch, parseApiJson } from "@/utils/api";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LogOut() {
  const router = useRouter();
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogout = async () => {
    if (isLoggingOut) return;
    setIsLoggingOut(true);
    setError(null);

    try {
      const response = await apiFetch("/api/v1/auth/logout", {
        method: "POST",
      });
      await parseApiJson(response);

      if (typeof window !== "undefined") {
        localStorage.removeItem("authToken");
        localStorage.removeItem("userData");
        localStorage.removeItem("username");
        sessionStorage.removeItem("prefill_display_name");
        sessionStorage.removeItem("prefill_avatar_url");
      }

      window.dispatchEvent(new Event("auth:logout"));
      router.push("/");
      router.refresh();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Unexpected logout error";
      setError(message);
    } finally {
      setIsLoggingOut(false);
    }
  };

  return (
    <div className="flex flex-col items-center gap-2">
      <button
        onClick={handleLogout}
        disabled={isLoggingOut}
        className="cursor-pointer mx-[25%] w-[50%] p-4 bg-red-600 hover:bg-red-800 disabled:bg-red-400 text-white rounded-md text-center text-2xl font-medium transition-all duration-300"
      >
        <p>{isLoggingOut ? "Logging out..." : "Log Out"}</p>
      </button>
      {error ? (
        <p className="text-red-300 text-base text-center">{error}</p>
      ) : null}
    </div>
  );
}
