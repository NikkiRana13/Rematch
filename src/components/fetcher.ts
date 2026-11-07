"use client";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(url: string, init?: RequestInit & { body?: BodyInit | null }): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, {
      ...init,
      headers: { "Content-Type": "application/json", ...(init?.headers ?? {}) },
      cache: "no-store",
    });
  } catch {
    throw new ApiError(0, "network", "We couldn't reach Rematch. Check your connection and try again.");
  }
  const data = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
  if (!res.ok) throw new ApiError(res.status, data.code ?? "error", data.error ?? "Something went wrong.");
  return data as T;
}

export const post = <T = unknown>(url: string, body?: unknown) =>
  api<T>(url, { method: "POST", body: body === undefined ? undefined : JSON.stringify(body) });
