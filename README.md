# hookray-mcp

> Webhook testing for AI agents — capture, inspect, replay HTTP requests from Claude Code, Cursor, Claude Desktop, or any MCP-compatible client.

[![npm version](https://img.shields.io/npm/v/hookray-mcp.svg)](https://www.npmjs.com/package/hookray-mcp)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

`hookray-mcp` is the [Model Context Protocol](https://modelcontextprotocol.io/) server for [HookRay](https://hookray.com). Drop it into your AI agent's config and the agent can spin up disposable webhook URLs, watch incoming requests live, and replay captured payloads against your local handler — without leaving the chat.

## Why this exists

AI coding agents increasingly write webhook handlers (Stripe, GitHub, Shopify, Twilio, …). The agent loop today is:

1. Generate handler code
2. **Manually** test it by triggering a real event
3. **Manually** copy/paste the captured payload back to the agent
4. Agent fixes the bug
5. Repeat from step 2

With `hookray-mcp` installed, the agent does steps 2–4 itself:

```
You: "Build me a Stripe webhook handler at /api/stripe."
Agent: [writes code, then calls hookray-mcp tools]
       → create_webhook_inbox
       → wait_for_request   (you trigger an event in Stripe)
       → inspect_request
       → replay_request to localhost:3000/api/stripe
       → "Returned 500. The bug is in the signature check at line 14."
```

## Install

```bash
# Anywhere npx works
npx -y hookray-mcp@latest

# Or globally
npm install -g hookray-mcp
```

Node.js 20+ required.

## Configure your AI client

### Claude Desktop

Edit `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) or `%APPDATA%\Claude\claude_desktop_config.json` (Windows):

```json
{
  "mcpServers": {
    "hookray": {
      "command": "npx",
      "args": ["-y", "hookray-mcp@latest"]
    }
  }
}
```

### Claude Code

```bash
claude mcp add hookray -- npx -y hookray-mcp@latest
```

### Cursor

Add to `.cursor/mcp.json` in your project (or the global Cursor MCP config):

```json
{
  "mcpServers": {
    "hookray": {
      "command": "npx",
      "args": ["-y", "hookray-mcp@latest"]
    }
  }
}
```

### With a HookRay API key (for Pro features)

If you have a HookRay account and want persistent inboxes, pass `HOOKRAY_API_KEY`:

```json
{
  "mcpServers": {
    "hookray": {
      "command": "npx",
      "args": ["-y", "hookray-mcp@latest"],
      "env": {
        "HOOKRAY_API_KEY": "hkr_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx"
      }
    }
  }
}
```

Get a key at [hookray.com/app/settings/api-keys](https://hookray.com/app/settings/api-keys).

## Tools

| Tool | Description | Auth |
|---|---|---|
| `create_webhook_inbox` | Generate a fresh `https://hookray.com/api/hook/xxxx` URL that captures any HTTP request. Returns the URL + inbox id. | Anonymous OK. `persistent: true` needs Pro. |
| `list_requests` | List recent requests captured by an inbox (with filters: method, since, search, limit). | Anonymous OK. |
| `inspect_request` | Get the full method + headers + body + query params of a single captured request. | Anonymous OK. |
| `wait_for_request` | Block (up to 60 s) until a new request arrives. Critical for AI agent dev loops. | Anonymous OK. |
| `replay_request` | Forward a captured request to any URL — including `localhost`. Runs client-side from this package so private IPs work. | Anonymous OK. |

## Environment variables

| Variable | Default | Notes |
|---|---|---|
| `HOOKRAY_BASE_URL` | `https://hookray.com` | Override for self-hosting or local dev. |
| `HOOKRAY_API_KEY` | _(unset)_ | Required for persistent inboxes. Get one at [hookray.com/app/settings/api-keys](https://hookray.com/app/settings/api-keys). |

## Example: Stripe webhook handler dev loop

```text
> "Add a Stripe webhook handler at /api/stripe/webhook in this Next.js app."
[agent writes app/api/stripe/webhook/route.ts]

> "Now test it."
[agent calls hookray-mcp]
  → create_webhook_inbox        → https://hookray.com/api/hook/abc12345
  → "Paste this URL into Stripe → Add endpoint, then trigger an event."

[you trigger a test event from Stripe dashboard]

  → wait_for_request(inbox_id)  → {method: POST, content_type: application/json, ...}
  → inspect_request(...)        → full headers (incl. stripe-signature) + body
  → replay_request(destination_url=http://localhost:3000/api/stripe/webhook)
                                → {status_code: 400, body: "No signatures..."}
  → "Your handler is reading req.json() before constructEvent. Switch to
     req.text() — Stripe's signature check needs the raw body."
[agent edits the handler]
  → replay_request(...)         → {status_code: 200}
```

## Free vs Pro

| Capability | Free | HookRay Pro |
|---|---|---|
| Anonymous inboxes | ✅ | ✅ |
| Capture, list, inspect, wait | ✅ | ✅ |
| Replay to any URL (incl. localhost) | ✅ | ✅ |
| Inbox lifetime | 7 days | 10 years |
| Multiple inboxes | 1 active | up to 10 |
| Request history | 100 / month | 10,000 / month |

Pro is $9 / month at [hookray.com/pricing](https://hookray.com/pricing).

## Limitations & non-goals

- **stdio transport only** for v0.1. SSE / HTTP transports may come later.
- **No automatic agent triggering of real Stripe events** — you still need to fire the event yourself from the provider dashboard or CLI. (Provider-specific sample-payload tools are on the roadmap.)
- **No WebSocket realtime** — `wait_for_request` long-polls (1 s tick, 60 s max). Good enough for dev loops; not designed for production traffic.
- **SSRF safety on `replay_request`** is your responsibility (the package runs on your machine, in your network).

## Roadmap

- [ ] Provider-specific template tools (`send_stripe_test_event`, `send_github_test_event`, …)
- [ ] SSE transport for hosted MCP gateways
- [ ] Streamed responses for long-running replays
- [ ] First-class self-host docs (point at your own HookRay instance via `HOOKRAY_BASE_URL`)

## Development

```bash
git clone https://github.com/ShotaTanikawa/hookray-mcp.git
cd hookray-mcp
pnpm install
pnpm build
pnpm test
```

## License

MIT © 2026 Shota Tanikawa. See [LICENSE](LICENSE).

---

Made by [@ShotaTanikawa](https://github.com/ShotaTanikawa) · [HookRay](https://hookray.com) · Feedback welcome — [open an issue](https://github.com/ShotaTanikawa/hookray-mcp/issues).
