---
name: job-command-handoff
description: Loads the compiled Job Command project memory so a new chat keeps 100% of prior work. Use at the start of every Job Command session, when the user asks to continue, branch, hand off, compile context, or open a new chat on the same project.
---

# Job Command handoff

This skill is the durable memory for **Job Command**. New chats in this repo must read it before changing code.

## On session start

1. Read [CONTEXT.md](CONTEXT.md) in full.
2. Read `AGENTS.md` at the repo root.
3. Confirm the live preview (port **43123**) and send the phone + local links in the first sentence of the first reply.
4. Do not re-litigate finished decisions in CONTEXT.md unless Eric explicitly reverses them.

## Branching to a new chat

This skill **is** the branch. A new Cloud Agent / Composer chat on the Job Command repo inherits the same git tree. Tell Eric:

- Open a new agent on this same project.
- First message: `Read AGENTS.md and .cursor/skills/job-command-handoff/CONTEXT.md. Continue Job Command. Wait for my next request.`
- Past chats stay as history; this file is the source of truth going forward.

Do not claim you spawned a second Cursor chat unless a real `https://cursor.com/agents/<id>` URL exists.

## After finishing a request

Append a dated bullet to the **Inbox / log** section of CONTEXT.md (what changed, files, URLs, decisions). Keep it factual. Leave the **Future requests** list open for Eric.

## What never belongs here

Secrets, Stripe keys, PIN values beyond what README already documents, or the temporary scaffold repo name.
