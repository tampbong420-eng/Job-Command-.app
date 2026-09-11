export type CrewStatus = "active" | "break" | "off";
export type JobStatus = "lead" | "pending" | "in_progress" | "completed";
export type JobPriority = "high" | "medium" | "low";
export type Role = "employee" | "boss";
export type NavTab = "command" | "jobs" | "profile" | "settings";
export type ShopView = "command" | "hours" | "jobs" | "estimates" | "timecards";
export type Weekday = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type DaySchedule = {
  day: Weekday;
  start: string;
  end: string;
  off: boolean;
};

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
  weeklySchedule: DaySchedule[];
  lat: number | null;
  lng: number | null;
  gpsLive: boolean;
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

export type Estimate = {
  id: string;
  jobId: string;
  amount: number;
  notes: string;
  createdAt: string;
};

export type TimeCard = {
  id: string;
  employeeId: string;
  jobId: string | null;
  hours: number;
  date: string;
  notes: string;
};

export type ShopSnapshot = {
  jobs: Job[];
  crew: CrewMember[];
  estimates: Estimate[];
  timeCards: TimeCard[];
  selectedJobId: string | null;
  selectedCrewId: string | null;
};

export type ShopCommand =
  | { type: "set_status"; query: string; status: JobStatus }
  | { type: "delete_job"; query: string }
  | {
      type: "create_estimate";
      query: string;
      amount: number;
      notes?: string;
    }
  | {
      type: "create_timecard";
      employee: string;
      hours: number;
      query?: string;
      notes?: string;
    }
  | { type: "open"; view: ShopView }
  | { type: "assign"; query: string; employee: string }
  | {
      type: "create_job";
      customerName: string;
      address?: string;
      jobTitle?: string;
      phone?: string;
      status?: JobStatus;
    };

export type TalkResult = {
  say: string;
  commands: ShopCommand[];
};
