const rawApiBaseUrl =
  process.env.NEXT_PUBLIC_API_URL || process.env.NEXT_PUBLIC_BACKEND_URL || "";

export type ApiEnvelope<T = unknown> = {
  success: boolean;
  data?: T;
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
  message?: string;
  [key: string]: unknown;
};

export class ApiRequestError extends Error {
  status: number;
  code?: string;
  details?: unknown;
  payload?: unknown;

  constructor(message: string, {
    status,
    code,
    details,
    payload,
  }: {
    status: number;
    code?: string;
    details?: unknown;
    payload?: unknown;
  }) {
    super(message);
    this.name = "ApiRequestError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.payload = payload;
  }
}

export function getApiBaseUrl() {
  if (!rawApiBaseUrl) {
    if (typeof window === "undefined") {
      return "http://localhost:5000";
    }

    throw new Error(
      "Missing NEXT_PUBLIC_API_URL. Set it in frontend/.env.local or the hosting environment."
    );
  }

  return rawApiBaseUrl.replace(/\/+$/, "");
}

export function apiUrl(path: string) {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${getApiBaseUrl()}${normalizedPath}`;
}

export function apiFetch(path: string, init: RequestInit = {}) {
  return fetch(apiUrl(path), {
    credentials: "include",
    ...init,
    headers: {
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...init.headers,
    },
  });
}

export async function parseApiJson<T = unknown>(response: Response): Promise<ApiEnvelope<T>> {
  const payload = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!response.ok || payload?.success === false) {
    throw new ApiRequestError(
      payload?.error?.message || payload?.message || `Request failed (${response.status})`,
      {
        status: response.status,
        code: payload?.error?.code,
        details: payload?.error?.details,
        payload,
      }
    );
  }

  return payload;
}

export async function apiJson<T = unknown>(
  path: string,
  init: RequestInit = {}
): Promise<ApiEnvelope<T>> {
  const response = await apiFetch(path, init);
  return parseApiJson<T>(response);
}
