"use client";

import { useEffect, useState } from "react";
import { applyMockPreview } from "@/lib/initial-data";
import { cacheWorkspace, overlayWorkspace } from "@/lib/offline/cache";
import { OFFLINE_EVENT } from "@/lib/offline/types";
import type { CustomerDTO, EmployeeDTO, EstimateDTO, InvoiceDTO, JobDTO, PayrollSettingsDTO } from "@/lib/types";

function present(next: {
  employees: EmployeeDTO[];
  jobs: JobDTO[];
  customers: CustomerDTO[];
  setupComplete?: boolean;
}) {
  return applyMockPreview({
    jobs: next.jobs,
    customers: next.customers,
    employees: next.employees,
    setupComplete: next.setupComplete,
  });
}

export function useWorkspaceOverlay(input: {
  employees: EmployeeDTO[];
  jobs: JobDTO[];
  customers: CustomerDTO[];
  invoices: InvoiceDTO[];
  estimates: EstimateDTO[];
  settings: PayrollSettingsDTO;
}) {
  const first = present({
    employees: input.employees,
    jobs: input.jobs,
    customers: input.customers,
    setupComplete: input.settings.setupComplete,
  });
  const [jobs, setJobs] = useState(first.jobs);
  const [customers, setCustomers] = useState(first.customers);
  const [estimates, setEstimates] = useState(input.estimates);
  const [employees, setEmployees] = useState(first.employees);

  useEffect(() => {
    const live = present({
      employees: input.employees,
      jobs: input.jobs,
      customers: input.customers,
      setupComplete: input.settings.setupComplete,
    });
    setJobs(live.jobs);
    setCustomers(live.customers);
    setEstimates(input.estimates);
    setEmployees(live.employees);
    void cacheWorkspace(input);
    let cancelled = false;
    void overlayWorkspace(input).then((next) => {
      if (cancelled) return;
      const preview = present({ ...next, setupComplete: input.settings.setupComplete });
      setJobs(preview.jobs);
      setCustomers(preview.customers);
      setEstimates(next.estimates);
      setEmployees(preview.employees);
    });
    const refresh = () => {
      void overlayWorkspace(input).then((next) => {
        if (cancelled) return;
        const preview = present({ ...next, setupComplete: input.settings.setupComplete });
        setJobs(preview.jobs);
        setCustomers(preview.customers);
        setEstimates(next.estimates);
        setEmployees(preview.employees);
      });
    };
    window.addEventListener(OFFLINE_EVENT, refresh);
    window.addEventListener("job-command-synced", refresh);
    window.addEventListener("job-command-photo-synced", refresh);
    window.addEventListener("job-command-photo-linked", refresh);
    return () => {
      cancelled = true;
      window.removeEventListener(OFFLINE_EVENT, refresh);
      window.removeEventListener("job-command-synced", refresh);
      window.removeEventListener("job-command-photo-synced", refresh);
      window.removeEventListener("job-command-photo-linked", refresh);
    };
  }, [input.employees, input.jobs, input.customers, input.invoices, input.estimates, input.settings]);

  return { employees, jobs, customers, estimates };
}
