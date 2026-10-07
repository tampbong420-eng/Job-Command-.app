---
name: job-command-daily
description: Playbooks for Eric’s repeatable Job Command tasks: link, Style A, crew profile, company look, git on main, and logging the handoff. Use for daily shop-desk work in this repo.
---

# Daily playbooks

Copy the matching checklist. Do not invent a second app or a second component library.

## 1. “Send me the link”

- [ ] Confirm `43123` returns 200
- [ ] Confirm tunnel 200 or restart it
- [ ] First sentence = URLs (default + `?style=a` if HUD was in play)

## 2. Style A / HUD / “look at the pictures”

- [ ] Keep default CSS untouched
- [ ] Change only `data-style="a"` CSS, `StyleAHud`, `ThemePicker`, `lib/style-a.ts`
- [ ] Send `/?style=a`
- [ ] Run `npx tsx --test lib/style-a.test.ts`

## 3. Crew / employee profile

- [ ] Touch only profile/home/swipe files
- [ ] Boss edit vs crew clock rules stay
- [ ] Swipe still changes people, not the page chrome

## 4. Company → App look

- [ ] Theme 1 Dark / Theme 2 Light stay
- [ ] Style A is a separate toggle + five color inputs
- [ ] Picking Dark/Light turns Style A off

## 5. Ship on main

```bash
git add -A  # never add backup zips
git commit -m "..."
git push -u origin main
```

No PR unless asked. After visual work, commit **before** a long test pass, then push.

## 6. Close the loop

Append a dated line to `.cursor/skills/job-command-handoff/CONTEXT.md` Inbox. If Eric named a future job, add it under Future requests.

## Vercel (when publishing)

Fluid Compute / Node.js. Do not set `runtime = 'edge'`. Marketplace integrations before hardcoding Stripe/Shopify SDKs. Prefer `vercel.ts` for new config. Streaming works on Node.
