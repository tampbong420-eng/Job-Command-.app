/**
 * No built-in shop address. A shop's start point is its own Company address; when it has none,
 * directions start from wherever the phone is (Google's default) and drive times are estimates.
 */
export const DEFAULT_SHOP = "";

export function publicMapsKey() {
  return process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() || "";
}

export function encodePlace(value: string) {
  return encodeURIComponent(value.trim().replace(/\s+/g, " "));
}

export function navigateUrl(destination: string, origin?: string) {
  const dest = encodePlace(destination);
  const start = origin?.trim() ? `&origin=${encodePlace(origin)}` : "";
  return `https://www.google.com/maps/dir/?api=1&destination=${dest}${start}&travelmode=driving`;
}

export function placeEmbedUrl(address: string, key = publicMapsKey()) {
  const q = encodePlace(address);
  if (key) {
    return `https://www.google.com/maps/embed/v1/place?key=${key}&q=${q}&zoom=17`;
  }
  return `https://maps.google.com/maps?q=${q}&z=17&output=embed`;
}

export function directionsEmbedUrl(origin: string, destination: string, key = publicMapsKey()) {
  if (!origin?.trim()) return placeEmbedUrl(destination, key);
  const from = encodePlace(origin);
  const to = encodePlace(destination);
  if (key) {
    return `https://www.google.com/maps/embed/v1/directions?key=${key}&origin=${from}&destination=${to}&mode=driving`;
  }
  return `https://maps.google.com/maps?saddr=${from}&daddr=${to}&hl=en&output=embed`;
}

export function streetViewEmbedUrl(
  address: string,
  coords?: { lat: number; lng: number } | null,
  key = publicMapsKey()
) {
  if (key && coords) {
    return `https://www.google.com/maps/embed/v1/streetview?key=${key}&location=${coords.lat},${coords.lng}&fov=80`;
  }
  if (coords) {
    return `https://maps.google.com/maps?layer=c&cbll=${coords.lat},${coords.lng}&cbp=12,0,0,0,0&output=svembed`;
  }
  const q = encodePlace(address);
  if (key) {
    return `https://www.google.com/maps/embed/v1/place?key=${key}&q=${q}&zoom=18`;
  }
  return `https://maps.google.com/maps?q=${q}&layer=c&z=18&output=svembed`;
}

export function satelliteEmbedUrl(
  address: string,
  coords?: { lat: number; lng: number } | null,
  key = publicMapsKey()
) {
  if (key && coords) {
    return `https://www.google.com/maps/embed/v1/view?key=${key}&center=${coords.lat},${coords.lng}&zoom=19&maptype=satellite`;
  }
  if (coords) {
    return `https://maps.google.com/maps?ll=${coords.lat},${coords.lng}&z=19&t=k&output=embed`;
  }
  const q = encodePlace(address);
  if (key) {
    return `https://www.google.com/maps/embed/v1/place?key=${key}&q=${q}&zoom=19&maptype=satellite`;
  }
  return `https://maps.google.com/maps?q=${q}&t=k&z=19&output=embed`;
}

export function shopAddress(businessAddress?: string | null) {
  return businessAddress?.trim() || DEFAULT_SHOP;
}
