export class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
export async function request<T>(path: string, options: RequestInit = {}, csrf?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (csrf) headers.set("X-CSRF-Token", csrf);
  const response = await fetch("/api/admin/" + path, { ...options, headers, credentials: "same-origin", cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new ApiError(data.error || "请求失败，请稍后重试。", response.status);
  return data as T;
}
