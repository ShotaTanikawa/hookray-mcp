import { beforeEach, describe, expect, test, vi } from "vitest";

import { HookRayClient } from "../src/client.js";
import { createWebhookInboxTool } from "../src/tools/create-inbox.js";
import { inspectRequestTool } from "../src/tools/inspect-request.js";
import { listRequestsTool } from "../src/tools/list-requests.js";
import { replayRequestTool } from "../src/tools/replay-request.js";
import { waitForRequestTool } from "../src/tools/wait-for-request.js";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type FetchCall = Parameters<FetchLike>;

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const textResponse = (body: string, status = 200, headers: HeadersInit = {}): Response =>
  new Response(body, { status, headers });

const headersFromCall = (call: FetchCall): Headers =>
  new Headers(call[1]?.headers);

describe("tool handlers", () => {
  let fetchMock: ReturnType<typeof vi.fn<FetchLike>>;
  let client: HookRayClient;

  beforeEach(() => {
    fetchMock = vi.fn<FetchLike>();
    client = new HookRayClient({
      apiKey: "hkr_live_test",
      baseUrl: "https://example.test",
      fetchImpl: fetchMock,
      retryDelayMs: 0,
    });
  });

  test("create_webhook_inbox posts the expected backend payload", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        inbox_id: "abc12345",
        url: "https://hookray.com/h/abc12345",
        expires_at: "2026-05-15T00:00:00.000Z",
        max_requests: 100,
      }),
    );

    const output = await createWebhookInboxTool.handler({ persistent: true }, { client });

    expect(output.inbox_id).toBe("abc12345");
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]).toBe("https://example.test/api/v1/mcp/inbox");
    expect(call![1]?.method).toBe("POST");
    expect(headersFromCall(call!).get("authorization")).toBe("Bearer hkr_live_test");
    expect(call![1]?.body).toBe(JSON.stringify({ persistent: true }));
  });

  test("list_requests builds backend filters and parses summaries", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        requests: [
          {
            request_id: "req_1",
            method: "POST",
            captured_at: "2026-05-15T00:00:00.000Z",
            content_type: "application/json",
            body_preview: "{\"ok\":true}",
          },
        ],
      }),
    );

    const output = await listRequestsTool.handler(
      {
        inbox_id: "abc12345",
        limit: 10,
        method: "POST",
        since: "2026-05-15T00:00:00.000Z",
        search: "ok",
      },
      { client },
    );

    expect(output.requests[0]?.request_id).toBe("req_1");
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]).toBe(
      "https://example.test/api/v1/mcp/inbox/abc12345/requests?limit=10&method=POST&since=2026-05-15T00%3A00%3A00.000Z&search=ok",
    );
    expect(call![1]?.method).toBe("GET");
  });

  test("inspect_request fetches and parses a single captured request", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: "{\"ok\":true}",
        query_params: { mode: "test" },
        content_type: "application/json",
        captured_at: "2026-05-15T00:00:00.000Z",
        source_ip: "203.0.113.10",
      }),
    );

    const output = await inspectRequestTool.handler(
      { inbox_id: "abc12345", request_id: "req_1" },
      { client },
    );

    expect(output.method).toBe("PATCH");
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]).toBe("https://example.test/api/v1/mcp/inbox/abc12345/requests/req_1");
  });

  test("wait_for_request forwards long-poll params and parses timeout", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ timeout: true }));

    const output = await waitForRequestTool.handler(
      {
        inbox_id: "abc12345",
        timeout_seconds: 30,
        since: "2026-05-15T00:00:00.000Z",
      },
      { client },
    );

    expect(output).toEqual({ timeout: true });
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    expect(call![0]).toBe(
      "https://example.test/api/v1/mcp/inbox/abc12345/wait?timeout=30&since=2026-05-15T00%3A00%3A00.000Z",
    );
  });

  test("replay_request inspects remotely and replays locally with stripped headers", async () => {
    const largeResponseBody = "x".repeat(12_000);
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          method: "POST",
          headers: {
            authorization: "Bearer upstream",
            connection: "keep-alive",
            cookie: "session=secret",
            "content-type": "application/json",
            host: "hookray.com",
            "x-api-key": "secret",
            "x-custom": "keep-me",
          },
          body: "{\"event\":\"created\"}",
          query_params: {},
          content_type: "application/json",
          captured_at: "2026-05-15T00:00:00.000Z",
          source_ip: "203.0.113.10",
        }),
      )
      .mockResolvedValueOnce(textResponse(largeResponseBody, 202, { "x-result": "accepted" }));

    const output = await replayRequestTool.handler(
      {
        inbox_id: "abc12345",
        request_id: "req_1",
        destination_url: "http://localhost:3000/api/webhook",
        timeout_seconds: 10,
      },
      { client, fetchImpl: fetchMock, now: createSteppedClock([1_000, 1_123]) },
    );

    expect(output).toMatchObject({
      status_code: 202,
      response_body_preview: largeResponseBody.slice(0, 10 * 1024),
      response_headers: { "x-result": "accepted" },
      latency_ms: 123,
    });

    const inspectCall = fetchMock.mock.calls[0];
    const replayCall = fetchMock.mock.calls[1];
    expect(inspectCall).toBeDefined();
    expect(replayCall).toBeDefined();
    expect(inspectCall![0]).toBe("https://example.test/api/v1/mcp/inbox/abc12345/requests/req_1");
    expect(replayCall![0]).toBe("http://localhost:3000/api/webhook");
    expect(replayCall![1]?.method).toBe("POST");
    expect(replayCall![1]?.redirect).toBe("manual");
    expect(replayCall![1]?.body).toBe("{\"event\":\"created\"}");

    const replayHeaders = headersFromCall(replayCall!);
    expect(replayHeaders.get("content-type")).toBe("application/json");
    expect(replayHeaders.get("x-custom")).toBe("keep-me");
    expect(replayHeaders.has("authorization")).toBe(false);
    expect(replayHeaders.has("connection")).toBe(false);
    expect(replayHeaders.has("cookie")).toBe(false);
    expect(replayHeaders.has("host")).toBe(false);
    expect(replayHeaders.has("x-api-key")).toBe(false);
  });

  test("replay_request honors override_method and omits GET bodies", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({
          method: "POST",
          headers: { "content-type": "application/json" },
          body: "{\"event\":\"created\"}",
          query_params: {},
        }),
      )
      .mockResolvedValueOnce(textResponse("", 200));

    await replayRequestTool.handler(
      {
        inbox_id: "abc12345",
        request_id: "req_1",
        destination_url: "http://localhost:3000/api/webhook",
        override_method: "GET",
      },
      { client, fetchImpl: fetchMock },
    );

    const replayCall = fetchMock.mock.calls[1];
    expect(replayCall).toBeDefined();
    expect(replayCall![1]?.method).toBe("GET");
    expect(replayCall![1]?.body).toBeUndefined();
  });
});

const createSteppedClock = (values: readonly number[]): (() => number) => {
  let index = 0;
  return () => {
    const value = values[index] ?? values.at(-1);
    index += 1;
    if (value === undefined) {
      throw new Error("Clock has no values");
    }
    return value;
  };
};
