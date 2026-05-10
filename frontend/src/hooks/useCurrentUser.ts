"use client";
import { apiJson } from "@/utils/api";
import { useEffect, useState } from "react";

export type CurrentUser = {
  id?: string;
  user_id: string | number;
  user_name: string;
  username?: string;
  display_name: string;
  displayName?: string;
  google_account?: string | null;
  is_premium?: boolean;
  isPremium?: boolean;
  user_state?: string | null;
  education_level: string;
  educationLevel?: string | null;
  bio?: string | null;
  interested_subjects?: string[] | null;
  interestedSubjects?: string[] | null;
  profile_picture?: string | null;
  avatarUrl?: string | null;
  like?: number;
  dislike?: number;
};

type UseCurrentUserResult = {
  user: CurrentUser | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => void;
};

export function useCurrentUser(): UseCurrentUserResult {
  const [data, setData] = useState<CurrentUser | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(false);
  const [nonce, setNonce] = useState<number>(0);

  const refetch = () => setNonce((n) => n + 1);

  useEffect(() => {
    let aborted = false;
    const controller = new AbortController();
    
    const fetchCurrentUser = async () => {
      try {
        setLoading(true);
        setError(null);

        const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK === "1";
        if (USE_MOCK) {
          // Simulate latency
          await new Promise((r) => setTimeout(r, 300));
          const mock: CurrentUser = {
            user_id: 1,
            user_name: "johndoe",
            display_name: "John Doe",
            education_level: "Undergrad",
            bio: "Avid learner and problem solver.",
            interested_subjects: ["Calculus", "Programming", "Data Structures"],
            profile_picture: "/image/DefaultAvatar.png",
            like: 12,
            dislike: 2,
            google_account: null,
            is_premium: false,
            user_state: "active",
          };
          if (!aborted) setData(mock);
        } else {
          const payload = await apiJson<CurrentUser>("/api/v1/auth/me", {
            signal: controller.signal,
          });
          const currentUser: CurrentUser | null = payload?.data ?? null;
          if (!aborted) {
            setData(currentUser);
          }
        }
      } catch (err: any) {
        if (aborted) return;
        setError(err?.message || "Failed to load current user");
        setData(null);
      } finally {
        if (!aborted) setLoading(false);
      }
    };

    fetchCurrentUser();
    return () => {
      aborted = true;
      controller.abort();
    };
  }, [nonce]);

  return { user: data, isLoading: loading, error, refetch };
}

export default useCurrentUser;
