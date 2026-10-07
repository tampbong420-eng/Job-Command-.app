---
name: job-command-preview
description: Always send a working Job Command preview link first. Use whenever Eric asks for the app, the link, the phone URL, Style A, a screenshot, or says the app looks the same.
---

# Job Command preview

## First sentence of every reply

Put the working URL in the first sentence. No preamble.

- Default look: `http://127.0.0.1:43123/` and the current `https://<subdomain>.trycloudflare.com/`
- Style A: append `?style=a`
- Back to default: `?style=off`

If he says “send the link” / “right now”, that sentence is the whole answer until the URL is confirmed `200`.

## Keep the tunnel alive

- App: tmux `job-command-dev`, port **43123**
- Tunnel: tmux `jc-phone-tunnel` (`cloudflared` quick tunnel)
- Ping loop: tmux `jc-tunnel-keepalive`

If DNS fails or HTTP is not 200, **restart the tunnel and send the new URL**. Never paste a dead link.

## Preview card

When the local server is up, emit one valid XML preview tag:

```xml
<preview url="http://127.0.0.1:43123/" title="Job Command" description="Phone shop desk. Add ?style=a for the HUD theme."></preview>
```

Validate with `xmllint --noout -` before emitting.
