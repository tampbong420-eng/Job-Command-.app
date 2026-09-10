# Job Command

Field-service dispatch for a boss desk and a unique employee login link.
Each tech can clock in, share GPS, and see customer jobs with street view,
boss notes, and required supplies.

## Schema

Postgres DDL lives in `db/`:

- `db/schema.sql` — full `employees` and `jobs` tables
- `db/migrations/001_create_employees_and_jobs.sql` — base tables
- `db/migrations/003_time_entries.sql` — clock session hours

Employee columns added:

- `unique_link_token` — unique login URL token
- `is_on_clock` — clocked in/out
- `current_lat` / `current_lng` — live GPS while on the clock

Job columns added:

- `customer_name`, `customer_phone`, `address`
- `street_view_url`
- `boss_notes`
- `required_supplies`

Local development uses SQLite (`data/job-command.sqlite`) with the same
column names. Apply the Postgres files against your production database.

## Getting started

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the boss desk.
Copy an employee login link (`/e/<unique_link_token>`) to open the restricted
employee portal (`components/JobCommandApp.jsx`):

- Glowing orange clock-out / green clock-in status
- Today’s shift, hours, boss notes, and truck supplies
- On-clock-only crew paging directory
- Jobs and profile tabs only — no boss-desk admin

## Common commands

| Command         | Description                    |
| --------------- | ------------------------------ |
| `npm run dev`   | Development server             |
| `npm run build` | Production build               |
| `npm start`     | Serve the production build     |
| `npm test`      | Schema and data-layer tests    |
| `npm run lint`  | ESLint                         |

## API

| Method | Path                         | Description                                      |
| ------ | ---------------------------- | ------------------------------------------------ |
| GET    | `/api/employees`             | List crew                                        |
| POST   | `/api/employees`             | Create employee (issues `unique_link_token`)     |
| PATCH  | `/api/employees/:id`         | Update crew / rotate login link                  |
| DELETE | `/api/employees/:id`         | Remove employee                                  |
| GET    | `/api/jobs`                  | List jobs                                        |
| POST   | `/api/jobs`                  | Create a customer job                            |
| PATCH  | `/api/jobs/:id`              | Update job fields                                |
| DELETE | `/api/jobs/:id`              | Delete job                                       |
| GET    | `/api/crew/:token`           | Employee desk: job packet, crew directory, hours |
| PATCH  | `/api/crew/:token`           | `clock_in`, `clock_out`, or `location` GPS ping  |

## Cloud Agent environment

`.cursor/environment.json` installs with `npm install` and starts
`npm run dev` on port 3000.
