import type { JobCostDTO } from "@/lib/types";

export function CostCue({ cost }: { cost?: JobCostDTO | null }) {
  if (!cost?.alert) return null;
  const label =
    cost.alert === "hours"
      ? "Hours over the bid"
      : cost.alert === "materials"
        ? "Materials over the bid"
        : "Job running over";
  return (
    <p className="cost-cue">
      <span className="cost-pip" />
      {label}
    </p>
  );
}
