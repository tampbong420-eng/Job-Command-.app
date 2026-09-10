import JobCommandMasterApp from "@/components/JobCommandMaster";
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
      <JobCommandMasterApp
        initialRole="employee"
        lockRole
        employeeToken={token}
        initialError="Ask the boss to send the employee login link again."
      />
    );
  }

  return (
    <JobCommandMasterApp
      key={token}
      initialRole="employee"
      lockRole
      employeeToken={token}
      initialEmployee={employee}
      initialJobs={listJobsForEmployee(employee.id)}
      initialCrew={listCrewDirectory(employee.id)}
      initialHours={getHoursSummary(employee.id)}
    />
  );
}
