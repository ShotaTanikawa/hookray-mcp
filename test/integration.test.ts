import { execFile } from "node:child_process";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { beforeAll, describe, expect, test } from "vitest";

const execFileAsync = promisify(execFile);
const repoRoot = fileURLToPath(new URL("../", import.meta.url));

describe("stdio MCP server", () => {
  beforeAll(async () => {
    await execFileAsync("pnpm", ["build"], {
      cwd: repoRoot,
      env: stringEnv(),
    });
  }, 30_000);

  test("lists the five HookRay tools", async () => {
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: ["dist/index.js"],
      cwd: repoRoot,
      env: {
        ...stringEnv(),
        HOOKRAY_BASE_URL: "https://example.test",
      },
      stderr: "pipe",
    });
    const client = new Client({ name: "hookray-mcp-integration-test", version: "0.0.0" });

    await client.connect(transport);
    try {
      const result = await client.listTools();
      expect(result.tools.map((tool) => tool.name).sort()).toEqual([
        "create_webhook_inbox",
        "inspect_request",
        "list_requests",
        "replay_request",
        "wait_for_request",
      ]);
      expect(result.tools).toHaveLength(5);
    } finally {
      await client.close();
    }
  }, 30_000);
});

const stringEnv = (): Record<string, string> =>
  Object.fromEntries(
    Object.entries(process.env).filter((entry): entry is [string, string] => typeof entry[1] === "string"),
  );
