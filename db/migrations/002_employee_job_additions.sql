-- Employees Table additions
ALTER TABLE employees ADD COLUMN unique_link_token VARCHAR(255) UNIQUE;
ALTER TABLE employees ADD COLUMN is_on_clock BOOLEAN DEFAULT FALSE;
ALTER TABLE employees ADD COLUMN current_lat FLOAT;
ALTER TABLE employees ADD COLUMN current_lng FLOAT;

-- Jobs Table additions
ALTER TABLE jobs ADD COLUMN customer_name VARCHAR(255);
ALTER TABLE jobs ADD COLUMN customer_phone VARCHAR(50);
ALTER TABLE jobs ADD COLUMN address TEXT;
ALTER TABLE jobs ADD COLUMN street_view_url TEXT;
ALTER TABLE jobs ADD COLUMN boss_notes TEXT;
ALTER TABLE jobs ADD COLUMN required_supplies TEXT;
