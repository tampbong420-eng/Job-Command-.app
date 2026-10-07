import "server-only";

/** Server Distance Matrix / geocode key. Never import this from a client component. */
export function mapsKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY?.trim() ||
    ""
  );
}
