"use client";
import { apiJson } from "@/utils/api";
import { useRouter } from "next/navigation";

type AuthUser = {
  username?: string | null;
  user_name?: string | null;
  displayName?: string | null;
  display_name?: string | null;
  avatarUrl?: string | null;
  profile_picture?: string | null;
};

type GoogleLoginPayload = {
  new_user?: boolean;
  data?: AuthUser;
};

export function useGoogleAuth() {
  const router = useRouter();

  const handleGoogleResponse = async (response: { credential?: string }) => {
    try {
      if (!response.credential) {
        throw new Error("Google credential is missing");
      }

      const payload = await apiJson<AuthUser>("/api/v1/auth/google", {
        method: "POST",
        body: JSON.stringify({ id_token: response.credential }),
      }) as GoogleLoginPayload;

      const user = payload.data;
      const username = user?.username || user?.user_name || "";

      if (typeof window !== "undefined" && user) {
        sessionStorage.setItem(
          "prefill_display_name",
          user.displayName || user.display_name || ""
        );
        sessionStorage.setItem(
          "prefill_avatar_url",
          user.avatarUrl || user.profile_picture || ""
        );
        if (username) localStorage.setItem("username", username);
      }

      if (payload.new_user || !username) {
        router.push("/register");
        return;
      }

      router.push(`/user/${username}`);
    } catch (error) {
      console.error("Error signing in with Google:", error);
    }
  };

  const handleGuestContinue = () => {
    router.push("/"); // Redirect to main page
  };

  return { handleGoogleResponse, handleGuestContinue };
}
