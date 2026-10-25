export class ApiError extends Error { status: number; constructor(message: string, status: number) { super(message); this.status = status; } }
export async function request<T>(path: string, options: RequestInit = {}, csrf?: string): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  if (csrf) headers.set("X-CSRF-Token", csrf);
  const response = await fetch("/api/admin/" + path, { ...options, headers, credentials: "same-origin", cache: "no-store" });
  if (!response.headers.get("Content-Type")?.includes("application/json")) {
    throw new ApiError("后台接口未返回有效数据，请检查 Node 服务和反向代理配置后重试。", response.status);
  }
  const data = await response.json().catch(() => null);
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new ApiError("后台返回的数据无法读取，请重新加载后重试。", response.status);
  if (!response.ok) throw new ApiError(data.error || "请求失败，请稍后重试。", response.status);
  return data as T;
}
