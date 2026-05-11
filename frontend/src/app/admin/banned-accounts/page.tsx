'use client';
import { getApiBaseUrl } from "@/utils/api";
import BannedUser from '@/components/banned_log/banned_user';
import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import KeyboardArrowLeftIcon from "@mui/icons-material/KeyboardArrowLeft";

interface BannedUserData {
  userId: string;
  name: string;
  nickname: string;
  bannedDate: string;
  profileImage: string;
}

export default function BannedAccountsPage() {
  const BASE = getApiBaseUrl()  ;
  const [bannedUsers, setBannedUsers] = useState<BannedUserData[]>([]);
  const [isLoadingBanned, setIsLoadingBanned] = useState(true);
  const [errorBanned, setErrorBanned] = useState<string | null>(null);

  const fetchBannedUsers = useCallback(async () => {
    setIsLoadingBanned(true);
    setErrorBanned(null);
    try {
      const res = await fetch(`${BASE}/api/v1/admins/users/banned`, {
        method: "GET",
        credentials: "include",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        console.error(`Failed to load banned users: ${res.status}`);
        setErrorBanned(`Failed to load banned users: ${res.status}`);
        setBannedUsers([]);
        return;
      }
      const items =  body.data ?? [];
      
      const mapped: BannedUserData[] = items.map((u: any) => ({
        // user_id,
        // user_name,
        // display_name,
        // email,
        // user_state,
        // updated_at AS banned_at
        name: u.user_name,
        nickname: u.display_name,
        bannedDate: u.banned_at,
        profileImage: u.profile_picture,
        userId: String(u.user_id),
      }));
      
      setBannedUsers(mapped);
    } catch (error) {
      console.error("Error fetching banned users:", error);
      setErrorBanned(error instanceof Error ? error.message : 'An unknown error occurred.');
    } finally {
      setIsLoadingBanned(false);
    }
  }, [BASE]);

  useEffect(() => {
    fetchBannedUsers();
  }, [fetchBannedUsers]);

  const router = useRouter();

  return (
      <div className="max-w-3xl mx-auto px-4 py-8 pt-20 font-display">
          <div className="max-w-6xl mx-auto">
            <div className="flex items-start justify-between mb-6">
              <div>
                <h1 className="text-3xl font-bold text-gray-900 mb-2">Banned Accounts</h1>
                <p className="text-gray-600">Manage banned user accounts and review ban appeals</p>
              </div>
              <button
                aria-label="Back to admin"
                onClick={() => router.push('/admin')}
                className="ml-4 cursor-pointer inline-flex items-center justify-center bg-accent-200 p-2 rounded-full text-accent-400 hover:text-accent-600 hover:bg-accent-400/50"
              >
                <KeyboardArrowLeftIcon fontSize="small" />
              </button>
            </div>
            <div className="space-y-4">
              {isLoadingBanned ? (
                <div className="rounded-xl bg-white p-6 text-gray-600 shadow-sm">Loading banned accounts...</div>
              ) : errorBanned ? (
                <div className="rounded-xl bg-white p-6 text-red-600 shadow-sm">{errorBanned}</div>
              ) : bannedUsers.length === 0 ? (
                <div className="rounded-xl bg-white p-6 text-gray-600 shadow-sm">No banned accounts found.</div>
              ) : (
                bannedUsers.map((user) => (
                  <BannedUser
                    key={user.userId}
                    name={user.name}
                    nickname={user.nickname}
                    bannedDate={user.bannedDate}
                    profileImage={user.profileImage}
                    userId={user.userId}
                  />
                ))
              )}
            </div>
          </div>
      </div>
  );
}
