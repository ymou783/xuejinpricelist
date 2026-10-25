// getRandomValues also works on HTTP origins; randomUUID requires a secure context.
// These are public content IDs, separate from server-side session and upload IDs.
export function contentId(prefix: "poster" | "banner" | "contact" | "content") {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return prefix + "-" + Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
}
