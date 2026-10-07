export function smsHref(phone: string, body: string) {
  const to = phone.replace(/[^\d+]/g, "");
  const text = encodeURIComponent(body);
  const ios = typeof navigator !== "undefined" && /iPhone|iPad|iPod/i.test(navigator.userAgent);
  return ios ? `sms:${to}&body=${text}` : `sms:${to}?body=${text}`;
}

export function mailtoHref(to: string, subject: string, body: string) {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export function documentShareUrl(kind: "estimate" | "invoice", id: string) {
  if (typeof window === "undefined") return "";
  return `${window.location.origin}/api/export/document?kind=${kind}&id=${encodeURIComponent(id)}&view=1`;
}
