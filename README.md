# Job Command

A small [Next.js](https://nextjs.org) (App Router) dashboard for defining, running, and
tracking job commands. It ships with a JSON API and an in-memory backend so the whole
flow is runnable end to end with zero external services.

## Features

- Create a job (name + command)
- Run a job (simulated execution that reports an exit code and output)
- Delete a job
- Live status badges: `idle`, `running`, `completed`, `failed`

## Tech stack

- Next.js 16 (App Router) + React 19 + TypeScript
- Route Handlers under `app/api/jobs` backed by an in-memory store (`lib/store.ts`)

## Getting started

```bash
npm ci        # install dependencies (uses package-lock.json)
npm run dev   # start the dev server on http://localhost:3000
```

Then open [http://localhost:3000](http://localhost:3000).

## Common commands

| Command         | Description                          |
| --------------- | ------------------------------------ |
| `npm run dev`   | Start the development server         |
| `npm run build` | Production build                     |
| `npm start`     | Serve the production build           |
| `npm run lint`  | Run ESLint                           |

## API

| Method | Path             | Description                     |
| ------ | ---------------- | ------------------------------- |
| GET    | `/api/jobs`      | List all jobs                   |
| POST   | `/api/jobs`      | Create a job (`{name, command}`)|
| PATCH  | `/api/jobs/:id`  | Run a job (`{action: "run"}`)   |
| DELETE | `/api/jobs/:id`  | Delete a job                    |

> The store in `lib/store.ts` is intentionally in-memory and resets on server
> restart. Swap it for a database or durable queue for real deployments.

## Cloud Agent environment

`.cursor/environment.json` configures the Cursor Cloud Agent environment: it runs
`npm ci` to install dependencies and starts `npm run dev` in a persistent terminal on
port 3000.
Field-ops dashboard for Job Command. Both **Boss** and **Employee** roles share
the same shop: crew, jobs, estimates, time cards, and settings persist in the
browser.

Boss Command is the dispatch desk:

- **CREW** rolodex with live hours, clock status, and weekly schedule
- **Edit Hours** calendar for each crew member
- Combination-lock job tumbler that cycles **active jobs only**
- **Get Directions** opens Street View and Google Maps
- Live Google Map on the crew desk
- Semantic job colors: new leads red, pending orange/yellow, active light green, finished charcoal
- Customer cards with **New lead / Pending / Active / Finished / Delete**
- **Add customer** form plus Cards / Estimates / Time cards tabs
- **AI Talk** on every page for status, estimates, time cards, and new leads

Employee Command is the field side of the same shop:

- Orange **Clocked Out** / green **Clocked In** tile wired to the shared crew roster
- Assigned job with **Get Directions**
- On-clock crew Call list
- **My Stops** board (jobs locked to that employee)
- Profile identity picker so the phone can clock in as Mike, Dana, Sam, or Liv
- Settings for shop name, account chip, page alerts, and **Reset demo shop**

```bash
npm install
npm test
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). Switch **EMPLOYEE** /
**BOSS** in the top bar.
