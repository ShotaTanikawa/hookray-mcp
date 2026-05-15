import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

import {
  InspectRequestOutputSchema,
  ReplayRequestInputSchema,
  ReplayRequestOutputSchema,
  type HeaderRecord,
  type ReplayRequestOutput,
} from "../schemas.js";
import { getClient, getFetch, getNow, type ToolContext } from "./context.js";

const RESPONSE_PREVIEW_LIMIT_BYTES = 10 * 1024;

const STRIPPED_HEADERS = new Set([
  "authorization",
  "connection",
  "cookie",
  "host",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "x-api-key",
]);

export const replayRequestTool = {
  name: "replay_request",
  description: "Replay a captured HookRay request to any destination reachable from this machine.",
  inputSchema: ReplayRequestInputSchema,
  outputSchema: ReplayRequestOutputSchema,
  handler: async (input: unknown, context?: ToolContext): Promise<ReplayRequestOutput> => {
    const parsedInput = ReplayRequestInputSchema.parse(input);
    const client = getClient(context);
    const capturedRequest = InspectRequestOutputSchema.parse(
      await client.inspectRequest({
        inbox_id: parsedInput.inbox_id,
        request_id: parsedInput.request_id,
      }),
    );

    const method =
      parsedInput.override_method ?? (capturedRequest.body.length > 0 ? capturedRequest.method : "GET");
    const body = method.toUpperCase() === "GET" ? undefined : capturedRequest.body || undefined;
    const headers = strippedHeaders(capturedRequest.headers);
    const fetchImpl = getFetch(context);
    const now = getNow(context);

    const startedAt = now();
    let response: Response;
    const replayInit: RequestInit = {
      method,
      headers,
      signal: AbortSignal.timeout(parsedInput.timeout_seconds * 1_000),
      redirect: "manual",
    };
    if (body !== undefined) {
      replayInit.body = body;
    }
    try {
      response = await fetchImpl(parsedInput.destination_url, replayInit);
    } catch (error) {
      throw new McpError(
        ErrorCode.InternalError,
        `Failed to replay request to ${parsedInput.destination_url}: ${errorMessage(error)}`,
      );
    }
    const finishedAt = now();

    const responseBody = await response.text();
    return ReplayRequestOutputSchema.parse({
      status_code: response.status,
      response_body_preview: responseBody.slice(0, RESPONSE_PREVIEW_LIMIT_BYTES),
      response_headers: headersToRecord(response.headers),
      latency_ms: Math.max(0, Math.round(finishedAt - startedAt)),
    });
  },
};

const strippedHeaders = (headers: HeaderRecord): Headers => {
  const stripped = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (!STRIPPED_HEADERS.has(key.toLowerCase())) {
      stripped.set(key, value);
    }
  }
  return stripped;
};

const headersToRecord = (headers: Headers): HeaderRecord => {
  const record: HeaderRecord = {};
  headers.forEach((value, key) => {
    record[key] = value;
  });
  return record;
};

const errorMessage = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  return "unknown error";
};
