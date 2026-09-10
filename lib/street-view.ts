export function streetViewUrlFromAddress(address: string): string {
  const query = encodeURIComponent(address.trim());
  return `https://www.google.com/maps/@?api=1&map_action=pano&query=${query}`;
}

export function resolveStreetViewUrl(
  address: string | null | undefined,
  streetViewUrl: string | null | undefined,
): string | null {
  const explicit = streetViewUrl?.trim();
  if (explicit) return explicit;
  const place = address?.trim();
  if (place) return streetViewUrlFromAddress(place);
  return null;
}
