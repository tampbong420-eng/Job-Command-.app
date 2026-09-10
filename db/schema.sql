-- Job Command canonical Postgres schema.
-- New databases can apply this file as-is. Existing databases should run
-- db/migrations/ in order instead.

CREATE TABLE IF NOT EXISTS employees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(255) NOT NULL,
  role VARCHAR(100),
  phone VARCHAR(50),
  unique_link_token VARCHAR(255) UNIQUE,
  is_on_clock BOOLEAN DEFAULT FALSE,
  current_lat FLOAT,
  current_lng FLOAT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title VARCHAR(255),
  status VARCHAR(50) NOT NULL DEFAULT 'queued',
  assigned_employee_id UUID REFERENCES employees(id) ON DELETE SET NULL,
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  address TEXT,
  street_view_url TEXT,
  boss_notes TEXT,
  required_supplies TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS jobs_assigned_employee_id_idx
  ON jobs (assigned_employee_id);
