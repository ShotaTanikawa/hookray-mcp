import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

import { HookRayClient } from "../client.js";

export type ToolContext = {
  client?: HookRayClient;
  fetchImpl?: typeof fetch;
  now?: () => number;
};

export const getClient = (context?: ToolContext): HookRayClient => context?.client ?? new HookRayClient();

export const getFetch = (context?: ToolContext): typeof fetch => {
  const fetchImpl = context?.fetchImpl ?? fetch;
  if (typeof fetchImpl === "undefined") {
    throw new McpError(ErrorCode.InternalError, "This package requires Node 20+ native fetch.");
  }
  return fetchImpl;
};

export const getNow = (context?: ToolContext): (() => number) => context?.now ?? (() => performance.now());
