"use client";
import { apiFetch, apiJson } from "@/utils/api";
import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";

interface AdminLoginData {
  email: string;
  password: string;
}

interface AdminAuthResponse {
  success: boolean;
  token?: string;
  data?: {
    admin_id: string | number;
    name: string;
    email: string;
  };
  message?: string;
}

export function useAdminAuth() {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  const loginAdmin = useCallback(async (loginData: AdminLoginData): Promise<boolean> => {
    setIsLoading(true);
    setError("");

    try {
      const data = await apiJson<AdminAuthResponse["data"]>("/api/v1/adminAuth/login", {
        method: "POST",
        body: JSON.stringify(loginData),
      });

      if (data?.data && typeof window !== "undefined") {
        localStorage.setItem("adminData", JSON.stringify(data.data));
      }

      return true;
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An error occurred during login"
      );
      return false;
    } finally {
      setIsLoading(false);
    }
  }, []);

  const logoutAdmin = useCallback(async () => {
    try {
      await apiFetch("/api/v1/adminAuth/logout", {
        method: "POST",
      });
    } catch (err) {
      console.error("Error during admin logout:", err);
    }

    if (typeof window !== "undefined") {
      localStorage.removeItem("adminData");
    }
    router.push("/admin-login");
  }, [router]);

  const isAdminAuthenticated = useCallback(async (): Promise<boolean> => {
    try {
      const data = await apiJson<AdminAuthResponse["data"]>("/api/v1/adminAuth/me");
      if (data?.data && typeof window !== "undefined") {
        localStorage.setItem("adminData", JSON.stringify(data.data));
      }
      return true;
    } catch {
      if (typeof window !== "undefined") {
        localStorage.removeItem("adminData");
      }
      return false;
    }
  }, []);

  const clearError = useCallback(() => setError(""), []);

  return {
    loginAdmin,
    logoutAdmin,
    isAdminAuthenticated,
    isLoading,
    error,
    clearError,
  };
}
