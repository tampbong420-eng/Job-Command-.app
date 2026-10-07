/** Only same-site paths open from a notification tap. Client-safe (no Node imports). */
export function safeTapPath(href: unknown) {
  const h = String(href || "");
  return h.startsWith("/") && !h.startsWith("//") && !h.includes("\\") ? h : "/";
}
