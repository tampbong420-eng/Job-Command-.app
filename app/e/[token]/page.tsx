import JobCommandApp from "@/components/JobCommandApp";
import { getEmployeeByToken, listCrewDirectory } from "@/lib/employees";
import { getHoursSummary } from "@/lib/hours";
import { listJobsForEmployee } from "@/lib/jobs";

export const dynamic = "force-dynamic";

export default async function EmployeeLinkPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const employee = getEmployeeByToken(token);

  if (!employee) {
    return (
      <JobCommandApp
        employeeToken={token}
        initialError="Ask the boss to send the employee login link again."
      />
    );
  }

  return (
    <JobCommandApp
      key={token}
      employeeToken={token}
      initialEmployee={employee}
      initialJobs={listJobsForEmployee(employee.id)}
      initialCrew={listCrewDirectory(employee.id)}
      initialHours={getHoursSummary(employee.id)}
    />
  );
}
