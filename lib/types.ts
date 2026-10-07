export type PayFrequency = "WEEKLY" | "BIWEEKLY" | "ROLLING_3_WEEK";
export type PayType = "HOURLY" | "SALARY";
export type PeriodStatus =
  | "OPEN"
  | "PENDING_APPROVAL"
  | "APPROVED"
  | "PAID"
  | "LOCKED";
export type EntryStatus =
  | "SCHEDULED"
  | "IN_PROGRESS"
  | "COMPLETE"
  | "EARLY_CLOCK_OUT"
  | "INCOMPLETE"
  | "MISSED";
export type AdjustmentType = "DEDUCTION" | "REIMBURSEMENT";
export type AdjustmentCategory =
  | "TOOL_ALLOWANCE"
  | "UNIFORM"
  | "MATERIALS"
  | "OTHER";

export type LineKind = "LABOR" | "MATERIAL" | "OTHER";

export type DocLineDTO = {
  id: string;
  kind: LineKind;
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  amount: number;
  /** Good/better/best tier: "" = untiered, or "good" | "better" | "best". */
  tier?: string;
};

export type JobPhotoDTO = {
  id: string;
  url: string;
  caption: string;
  createdAt: string;
};

export type JobCostDTO = {
  laborHoursBudget: number;
  laborHoursActual: number;
  laborCostBudget: number;
  laborCostActual: number;
  materialBudget: number;
  materialActual: number;
  otherBudget: number;
  otherActual: number;
  revenue: number;
  grossProfit: number;
  laborMargin: number;
  netMargin: number;
  overLabor: boolean;
  overMaterial: boolean;
  alert: "hours" | "materials" | "both" | null;
};

export type JobDTO = {
  id: string;
  code: string;
  name: string;
  client: string;
  customerId: string | null;
  address: string;
  notes: string;
  timeline: string;
  dueDate: string | null;
  pipeline: number;
  leadCalledAt: string | null;
  prepChecklist?: string;
  photos: JobPhotoDTO[];
  cost?: JobCostDTO;
};

export type CustomerDTO = {
  id: string;
  name: string;
  phone: string;
  email: string;
  address: string;
};

export type InvoiceDTO = {
  id: string;
  number: string;
  customerId: string;
  jobId: string | null;
  amount: number;
  status: "DRAFT" | "PENDING" | "PAID";
  dueDate: string;
  notes: string;
  terms: string;
  taxRate: number;
  sentAt: string | null;
  paidAt?: string | null;
  publicToken?: string | null;
  payUrl?: string;
  applicationFee?: number;
  customerName: string;
  jobName: string | null;
  lines: DocLineDTO[];
};

export type EstimateStatus = import("@/lib/estimate-status").EstimateStatus;

export type DeliveryChannel = "email" | "sms" | "link";
export type DeliveryStatus = "queued" | "sent" | "delivered" | "opened" | "viewed" | "failed";

export type DeliveryEventDTO = {
  id: string;
  estimateId: string;
  customerId: string | null;
  channel: DeliveryChannel;
  status: DeliveryStatus;
  provider: string;
  toAddress: string;
  createdAt: string;
};

export type EstimateDTO = {
  id: string;
  number: string;
  jobId: string;
  customerId: string | null;
  status: EstimateStatus;
  notes: string;
  terms: string;
  taxRate: number;
  publicToken: string | null;
  sentAt: string | null;
  viewedAt: string | null;
  acceptedAt: string | null;
  changesAt: string | null;
  signedName: string;
  clientNote: string;
  sentEmail: boolean;
  sentSms: boolean;
  lastFollowUpAt: string | null;
  followUpCount: number;
  createdAt?: string | null;
  lines: DocLineDTO[];
  deliveries?: DeliveryEventDTO[];
};

export type ServiceCodeDTO = {
  id: string;
  code: string;
  name: string;
  className: string;
};

export type TimeEntryDTO = {
  id: string;
  date: string;
  scheduledHours: number;
  actualHours: number;
  clockIn: string | null;
  clockOut: string | null;
  scheduledStart: string | null;
  scheduledEnd: string | null;
  status: EntryStatus;
  jobId: string | null;
  serviceCodeId: string | null;
  notes: string | null;
  /** JOB | ESTIMATE; "" or missing = untagged older row (read from the job's stage). */
  kind?: "JOB" | "ESTIMATE" | "";
  job: JobDTO | null;
  serviceCode: ServiceCodeDTO | null;
};

export type AdjustmentDTO = {
  id: string;
  payPeriodId: string | null;
  jobId: string | null;
  type: AdjustmentType;
  category: AdjustmentCategory;
  description: string;
  amount: number;
};

export type PayPeriodDTO = {
  id: string;
  startDate: string;
  endDate: string;
  frequency: PayFrequency;
  regularHours: number;
  overtimeHours: number;
  regularPay: number;
  overtimePay: number;
  grossPay: number;
  deductions: number;
  reimbursements: number;
  federalTax: number;
  stateTax: number;
  netPay: number;
  status: PeriodStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  paidAt: string | null;
  adjustments: AdjustmentDTO[];
};

export type AuditLogDTO = {
  id: string;
  actor: string;
  action: string;
  field: string | null;
  oldValue: string | null;
  newValue: string | null;
  createdAt: string;
};

export type EmployeeDTO = {
  id: string;
  firstName: string;
  lastName: string;
  jobTitle: string;
  photoUrl: string | null;
  email: string | null;
  phone: string | null;
  payType: PayType;
  hourlyRate: number;
  salaryAnnual: number;
  baselineStartDate: string;
  payFrequency: PayFrequency;
  federalWithholdPct: number;
  stateWithholdPct: number;
  payMethod?: "W2" | "CASH" | "";
  filingStatus?: string;
  allowances?: number;
  onboardedAt?: string | null;
  employmentStatus?: import("@/lib/employment").EmploymentStatus;
  employmentEndDate?: string | null;
  /** Last 4 only. Full bank numbers never leave the server (go-public B5). */
  depositRoutingLast4?: string;
  depositAccountLast4?: string;
  depositAccountType?: "CHECKING" | "SAVINGS" | "";
  ytdGross: number;
  ytdFederalTax: number;
  ytdStateTax: number;
  ytdNet: number;
  ytdOvertime: number;
  timeEntries: TimeEntryDTO[];
  payPeriods: PayPeriodDTO[];
  adjustments: AdjustmentDTO[];
  auditLogs: AuditLogDTO[];
};

export type BillingStatus = import("@/lib/billing").BillingStatus;
export type AddonStatus = import("@/lib/billing").AddonStatus;
export type ConnectStatus = import("@/lib/billing").ConnectStatus;
export type BillingDTO = import("@/lib/billing").BillingDTO;

export type PayrollSettingsDTO = {
  payFrequency: "WEEKLY" | "BIWEEKLY";
  periodAnchor: string;
  setupComplete: boolean;
  ownerFirstName: string;
  ownerLastName: string;
  ownerEmail: string;
  ownerPhone: string;
  businessName: string;
  businessAddress: string;
  businessEmail: string;
  industry: string;
  businessSize: string;
  accountingSoftware: "QUICKBOOKS" | "XERO" | "OTHER" | "NONE";
  companyPhone: string;
  answeringLine: string;
  logoUrl: string | null;
  acceptCard: boolean;
  acceptAch: boolean;
  acceptCash: boolean;
  depositPercent: number;
  bosses: BossDTO[];
  billing: BillingDTO;
  termsAcceptedAt: string | null;
  termsVersion: string;
  estimatePrompt: string;
  shellTheme: import("@/lib/shell-theme").ShellThemeId;
  shellInk: string;
  /** Signup v2 trade profile (services, area, hours, estimate numbers). */
  shop?: import("@/lib/signup-shop").ShopProfileDTO;
};

export type BossDTO = {
  id: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  email: string | null;
  isOwner: boolean;
};

export type Role = "ADMIN" | "CREW";

export type SessionDTO = {
  accountId: string;
  role: Role;
  name: string;
  employeeId: string | null;
  /** Multi-shop: AppSettings.id of the shop this login belongs to. Older cookies have none = "default". */
  shopId?: string;
};

export type GatePerson = {
  id: string;
  name: string;
  role: Role;
  photoUrl: string | null;
  title: string;
};

export type WorkspacePayload = {
  employees: EmployeeDTO[];
  jobs: JobDTO[];
  customers: CustomerDTO[];
  invoices: InvoiceDTO[];
  estimates: EstimateDTO[];
  serviceCodes: ServiceCodeDTO[];
  settings: PayrollSettingsDTO;
  session: SessionDTO | null;
};

export const FREQUENCY_LABEL: Record<PayFrequency, string> = {
  WEEKLY: "Weekly",
  BIWEEKLY: "Every 2 weeks",
  ROLLING_3_WEEK: "Every 3 weeks",
};

export const STATUS_LABEL: Record<EntryStatus, string> = {
  SCHEDULED: "Off",
  IN_PROGRESS: "On the clock",
  COMPLETE: "Done",
  EARLY_CLOCK_OUT: "Left early",
  INCOMPLETE: "Short",
  MISSED: "Missed",
};
