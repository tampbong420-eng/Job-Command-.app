-- Hours tracking for employee clock in/out sessions.

CREATE TABLE IF NOT EXISTS time_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  employee_id UUID NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  clocked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  clocked_out_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS time_entries_employee_id_idx
  ON time_entries (employee_id, clocked_in_at);
