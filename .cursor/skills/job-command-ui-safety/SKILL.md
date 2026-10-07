---
name: job-command-ui-safety
description: Protects Job Command default layout and crew-profile isolation. Use when changing themes, Style A, globals.css, cards, borders, employee profile, or any visual system.
---

# UI safety

## Default layout is sacred

Eric reverted a global brand-frame pass with **“No go back.”** Do not restyle `.command-card` / `.app-shell` for everyone.

Style A lives only under `.app-shell[data-style="a"]` plus `StyleAHud` when enabled.

Dark and light theme IDs stay. Do not replace `DEFAULT_SHELL_THEME`.

## Crew profile isolation

If the request is the employee/crew card, edit only that surface. Do not “unify” Command, Schedule, Pay, or Company as a side effect.

Boss-only edit except clock in/out. Do not open those controls to crew.

## Pictures over vibes

When Eric attaches HUD/frame images, match cut corners, hatches, brackets, and the five logo colors. A thick green border is not Style A.

## Verify

Phone viewport (~390×844) and the pages that share state. Empty, loading, and error states. If browser tools are missing, `curl` the preview and say what was not clicked.
