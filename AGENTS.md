# Job Command — agent brief

Phone-first shop desk for **Top Gun Painting** (Hot Springs, AR). Owner: Eric Stlawrence.

Read these before coding:

1. `.cursor/skills/job-command-handoff/SKILL.md`
2. `.cursor/skills/job-command-handoff/CONTEXT.md`
3. `.cursor/skills/job-command-preview/SKILL.md`
4. `.cursor/skills/job-command-ui-safety/SKILL.md`
5. `.cursor/skills/job-command-daily/SKILL.md`

## Non-negotiables

- Send a working app link in the **first sentence** of every reply (local `http://127.0.0.1:43123/` plus the live Cloudflare phone URL).
- Default dark/light layout is sacred. Style A is an **opt-in HUD overlay** (`data-style="a"`, `/?style=a`). Never overwrite the original layout.
- Do not touch unrelated files. Crew-profile work stays in crew-profile files.
- Develop on `main`. Commit and push. Do not open a PR unless Eric asks.
- Boss can edit everything except clock in/out. Crew cannot.

## Run

```bash
npm install
npx prisma db push
npx tsx prisma/seed.ts
npm run dev -- -p 43123 -H 0.0.0.0
```

Future work goes in the Inbox at the bottom of `CONTEXT.md`.
