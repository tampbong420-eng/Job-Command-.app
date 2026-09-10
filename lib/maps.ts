import type { CrewMember, Job } from "./types";

function point(lat: number, lng: number): string {
  return `${lat},${lng}`;
}

export function destinationQuery(job: Job): string {
  if (job.lat != null && job.lng != null) return point(job.lat, job.lng);
  return job.address;
}

export function originQuery(member: CrewMember): string | undefined {
  if (member.lat == null || member.lng == null) return undefined;
  return point(member.lat, member.lng);
}

export function mapsDirectionsUrl(job: Job, origin?: string): string {
  const params = new URLSearchParams({
    api: "1",
    destination: destinationQuery(job),
    travelmode: "driving",
  });
  if (origin) params.set("origin", origin);
  return `https://www.google.com/maps/dir/?${params.toString()}`;
}

export function mapsStreetViewUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps/@?api=1&map_action=pano&viewpoint=${point(lat, lng)}`;
}

export function mapsPlaceUrl(job: Job): string {
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destinationQuery(job))}`;
}

export function mapsEmbedUrl(query: string, zoom = 14): string {
  return `https://maps.google.com/maps?q=${encodeURIComponent(query)}&z=${zoom}&output=embed`;
}

export function mapsStreetViewEmbedUrl(lat: number, lng: number): string {
  return `https://www.google.com/maps?layer=c&cbll=${point(lat, lng)}&cbp=12,90,0,0,5&output=svembed`;
}

export function mapsLiveTrackEmbedUrl(member: CrewMember, job: Job | null): string | null {
  if (member.gpsLive && member.lat != null && member.lng != null && job?.lat != null && job.lng != null) {
    return `https://maps.google.com/maps?saddr=${point(member.lat, member.lng)}&daddr=${point(job.lat, job.lng)}&output=embed`;
  }
  if (member.gpsLive && member.lat != null && member.lng != null) {
    return mapsEmbedUrl(`${member.name}@${point(member.lat, member.lng)}`);
  }
  if (job) {
    return mapsEmbedUrl(destinationQuery(job));
  }
  return null;
}
