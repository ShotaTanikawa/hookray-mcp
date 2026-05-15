# HookRay MCP

Webhook testing for AI agents.

HookRay MCP lets Claude Code, Cursor, Claude Desktop, and other MCP clients create webhook inboxes, inspect captured requests, wait for webhooks, and replay them to local handlers.

## Install

```bash
npx -y hookray-mcp@latest
```

## Claude Desktop

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

`HOOKRAY_BASE_URL` defaults to `https://hookray.com`. `HOOKRAY_API_KEY` is optional unless you use Pro-only features.

## Tools

- `create_webhook_inbox` - Create a HookRay webhook inbox and get a capture URL.
- `list_requests` - List captured requests for an inbox.
- `inspect_request` - Read full headers, body, query params, and metadata for one request.
- `wait_for_request` - Long-poll until a new request arrives or the timeout expires.
- `replay_request` - Replay a captured request from your machine to any reachable URL, including localhost.

## Links

- HookRay: https://hookray.com

## License

MIT. Copyright 2026 Shota Tanikawa.
