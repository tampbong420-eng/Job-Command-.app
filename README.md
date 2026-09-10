# Job Command

Unified field-service command center: Windows-style tiles, employee/boss
role toggle, color-matched pages, on-clock crew paging, and restricted
employee portal links.

Open [http://localhost:3000](http://localhost:3000) for the master dashboard.
Use **BOSS** to generate unique `/e/<token>` links. Each link opens the
restricted employee portal (no boss toggle).

## Modules

- **Clock in/out** — orange when idle, glowing green when live
- **Today's job** — shock-blue outline, boss notes, truck supplies, maps
- **Schedule & hours** — hat-matched yellow outline and weekly totals
- **Crew comms** — page/call only for teammates who are on the clock
- **AI assistant** — job bot for shift, job, and supply questions
- **Profile** — restricted employee credentials
- **Employee links** — boss-only unique portal URL generator

## Getting started

```bash
npm install
npm run dev
```

Local development uses SQLite (`data/job-command.sqlite`) with the same
column names as the Postgres files in `db/`. Apply those files against
your production database.

Seeded demo crew: Eric St. Lawrence (today's Northline job), Ricky
(on the clock), and Dina (off the clock).

## Common commands

| Command         | Description                    |
| --------------- | ------------------------------ |
| `npm run dev`   | Development server             |
| `npm run build` | Production build               |
| `npm start`     | Serve the production build     |
| `npm test`      | Schema, paging, and data tests |
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
