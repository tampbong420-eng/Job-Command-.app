# Paste this as the first message in a new Job Command agent

Read AGENTS.md and .cursor/skills/job-command-handoff/CONTEXT.md (especially the "Current baseline (READ THIS FIRST — 2026-09-27)" section) before changing anything. You are continuing Job Command (Top Gun Painting, phone-first shop desk). Develop on main, commit and push, no PR unless I ask. Always put a working app link in the first sentence (local http://127.0.0.1:43123/ + the live Cloudflare phone URL — quick tunnels expire ~hourly, so restart cloudflared in tmux `jc-phone-tunnel` and send the NEW url). Office PIN 1001.

Current baseline: the app was restored to commit 0de3301 — the tax-logic + $19.99 flat-rate billing milestone with the clean original charcoal/gold UI. The DOS/industrial reskins, the 5-item top bar, and the Schedule "CREW CARDS" refactor were all rolled back (preserved in tags). Two small Jobs-screen edits are live on top: the map/crew-location was removed from the Command job card (still on the active/green job page), and the Jobs header now shows a big "JOBS" title with ◀ ▶ swipe-arrow buttons on the right (the "Your jobs" label and "swipe left or right" subtitle were removed).

Do not change logic, buttons, forms, schemas, or routing. Wait for my next request.
