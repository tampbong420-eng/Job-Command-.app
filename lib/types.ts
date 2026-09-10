export type Employee = {
  id: string;
  name: string;
  role: string | null;
  phone: string | null;
  unique_link_token: string | null;
  is_on_clock: boolean;
  current_lat: number | null;
  current_lng: number | null;
  created_at: string;
  updated_at: string;
};

export type Job = {
  id: string;
  title: string | null;
  status: string;
  assigned_employee_id: string | null;
  customer_name: string | null;
  customer_phone: string | null;
  address: string | null;
  street_view_url: string | null;
  boss_notes: string | null;
  required_supplies: string | null;
  created_at: string;
  updated_at: string;
  assigned_employee_name?: string | null;
};

export type EmployeeInput = {
  name: string;
  role?: string | null;
  phone?: string | null;
};

export type JobInput = {
  title?: string | null;
  status?: string | null;
  assigned_employee_id?: string | null;
  customer_name?: string | null;
  customer_phone?: string | null;
  address?: string | null;
  street_view_url?: string | null;
  boss_notes?: string | null;
  required_supplies?: string | null;
};
