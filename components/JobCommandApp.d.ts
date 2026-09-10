import type { CrewMember, Employee, HoursSummary, Job } from "@/lib/types";

export default function JobCommandApp(props: {
  employeeToken: string;
  initialEmployee?: Employee | null;
  initialJobs?: Job[];
  initialCrew?: CrewMember[];
  initialHours?: HoursSummary;
  initialError?: string | null;
}): React.JSX.Element;
