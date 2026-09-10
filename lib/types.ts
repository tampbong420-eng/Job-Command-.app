export type CrewStatus = "active" | "break" | "off";
export type JobStatus = "lead" | "in_progress" | "completed";
export type JobPriority = "high" | "medium" | "low";
export type Role = "employee" | "boss";
export type NavTab = "command" | "jobs" | "profile" | "settings";

export type CrewMember = {
  id: string;
  name: string;
  role: string;
  phone: string;
  photoUrl: string;
  status: CrewStatus;
  currentJob: string;
  currentJobId: string | null;
  startedAt: string | null;
  weeklyHoursTarget: number;
  weeklyHoursLogged: number;
  lat: number | null;
  lng: number | null;
};

export type Job = {
  id: string;
  customerName: string;
  phone: string;
  address: string;
  jobTitle: string;
  status: JobStatus;
  scheduledTime: string;
  worker: string;
  workerId: string | null;
  priority: JobPriority;
  lat: number | null;
  lng: number | null;
};

export type GeoPoint = {
  lat: number;
  lng: number;
};
