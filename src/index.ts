#!/usr/bin/env node
import { pathToFileURL } from "node:url";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { z } from "zod/v4";

import { HookRayClient } from "./client.js";
import { createWebhookInboxTool } from "./tools/create-inbox.js";
import { inspectRequestTool } from "./tools/inspect-request.js";
import { listRequestsTool } from "./tools/list-requests.js";
import { replayRequestTool } from "./tools/replay-request.js";
import type { ToolContext } from "./tools/context.js";
import { waitForRequestTool } from "./tools/wait-for-request.js";

type HookRayTool = {
  name: string;
  description: string;
  inputSchema: z.ZodType;
  outputSchema: z.ZodType;
  handler: (input: unknown, context?: ToolContext) => Promise<unknown>;
};

export const hookRayTools: readonly HookRayTool[] = [
  createWebhookInboxTool,
  listRequestsTool,
  inspectRequestTool,
  waitForRequestTool,
  replayRequestTool,
];

export const createHookRayMcpServer = (): McpServer => {
  const server = new McpServer({
    name: "hookray-mcp",
    version: "0.1.0",
  });
  const context: ToolContext = {
    client: new HookRayClient(),
  };

  for (const tool of hookRayTools) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.inputSchema,
        outputSchema: tool.outputSchema,
      },
      async (args: unknown) => {
        const structuredContent = toStructuredContent(await tool.handler(args, context));
        return {
          content: [
            {
              type: "text",
              text: JSON.stringify(structuredContent, null, 2),
            },
          ],
          structuredContent,
        };
      },
    );
  }

  return server;
};

export const startServer = async (): Promise<void> => {
  const server = createHookRayMcpServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
};

const toStructuredContent = (value: unknown): Record<string, unknown> => {
  if (isRecord(value)) {
    return value;
  }
  return { result: value };
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const isEntrypoint = (): boolean => {
  const scriptPath = process.argv[1];
  return scriptPath !== undefined && import.meta.url === pathToFileURL(scriptPath).href;
};

if (isEntrypoint()) {
  startServer().catch((error: unknown) => {
    const message = error instanceof Error ? error.stack ?? error.message : String(error);
    console.error(message);
    process.exit(1);
  });
}
