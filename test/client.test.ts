import { McpError } from "@modelcontextprotocol/sdk/types.js";
import { beforeEach, describe, expect, test, vi } from "vitest";

import { HookRayClient } from "../src/client.js";

type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

const jsonResponse = (body: unknown, status = 200): Response =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

const textResponse = (body: string, status: number): Response =>
  new Response(body, {
    status,
    headers: { "content-type": "text/plain" },
  });

describe("HookRayClient", () => {
  let fetchMock: ReturnType<typeof vi.fn<FetchLike>>;

  beforeEach(() => {
    fetchMock = vi.fn<FetchLike>();
  });

  test("creates an inbox with JSON body and authorization when an API key is configured", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        inbox_id: "abc12345",
        url: "https://hookray.com/h/abc12345",
        expires_at: "2026-05-15T00:00:00.000Z",
        max_requests: 100,
      }),
    );
    const client = new HookRayClient({
      apiKey: "hkr_live_test",
      baseUrl: "https://example.test/",
      fetchImpl: fetchMock,
    });

    const result = await client.createInbox({ persistent: true });

    expect(result).toEqual({
      inbox_id: "abc12345",
      url: "https://hookray.com/h/abc12345",
      expires_at: "2026-05-15T00:00:00.000Z",
      max_requests: 100,
    });
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe("https://example.test/api/v1/mcp/inbox");
    expect(init?.method).toBe("POST");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer hkr_live_test");
    expect(new Headers(init?.headers).get("content-type")).toBe("application/json");
    expect(init?.body).toBe(JSON.stringify({ persistent: true }));
  });

  test("lists requests with encoded path and query filters", async () => {
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
    const client = new HookRayClient({ baseUrl: "https://example.test", fetchImpl: fetchMock });

    const result = await client.listRequests({
      inbox_id: "abc 123",
      limit: 50,
      method: "POST",
      since: "2026-05-15T00:00:00.000Z",
      search: "ok:true",
    });

    expect(result.requests).toHaveLength(1);
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe(
      "https://example.test/api/v1/mcp/inbox/abc%20123/requests?limit=50&method=POST&since=2026-05-15T00%3A00%3A00.000Z&search=ok%3Atrue",
    );
    expect(init?.method).toBe("GET");
    expect(init?.body).toBeUndefined();
  });

  test("inspects a captured request", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{\"hello\":\"world\"}",
        query_params: { source: "stripe" },
        content_type: "application/json",
        captured_at: "2026-05-15T00:00:00.000Z",
        source_ip: "203.0.113.10",
      }),
    );
    const client = new HookRayClient({ baseUrl: "https://example.test", fetchImpl: fetchMock });

    const result = await client.inspectRequest({ inbox_id: "abc12345", request_id: "req/1" });

    expect(result.body).toBe("{\"hello\":\"world\"}");
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe("https://example.test/api/v1/mcp/inbox/abc12345/requests/req%2F1");
    expect(init?.method).toBe("GET");
  });

  test("waits for a request with timeout and since query params", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({ timeout: true }));
    const client = new HookRayClient({ baseUrl: "https://example.test", fetchImpl: fetchMock });

    const result = await client.waitForRequest({
      inbox_id: "abc12345",
      timeout_seconds: 120,
      since: "2026-05-15T00:00:00.000Z",
    });

    expect(result).toEqual({ timeout: true });
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe(
      "https://example.test/api/v1/mcp/inbox/abc12345/wait?timeout=120&since=2026-05-15T00%3A00%3A00.000Z",
    );
    expect(init?.method).toBe("GET");
  });

  test.each([
    [401, "Invalid or missing HOOKRAY_API_KEY. Get one at https://hookray.com/app/settings/api-keys"],
    [403, "This feature requires HookRay Pro. Upgrade at https://hookray.com/pricing"],
    [429, "HookRay rate limit reached. Wait a few seconds or upgrade to Pro."],
  ] as const)("maps HTTP %i to a helpful McpError", async (status, message) => {
    fetchMock.mockResolvedValueOnce(textResponse("nope", status));
    const client = new HookRayClient({ baseUrl: "https://example.test", fetchImpl: fetchMock });

    try {
      await client.createInbox({ persistent: true });
      throw new Error("Expected createInbox to throw");
    } catch (error) {
      expect(error).toBeInstanceOf(McpError);
      expect(error).toHaveProperty("message", expect.stringContaining(message));
    }
  });

  test("retries one network failure before surfacing a successful response", async () => {
    fetchMock
      .mockRejectedValueOnce(new TypeError("socket closed"))
      .mockResolvedValueOnce(jsonResponse({ requests: [] }));
    const client = new HookRayClient({
      baseUrl: "https://example.test",
      fetchImpl: fetchMock,
      retryDelayMs: 0,
    });

    await expect(client.listRequests({ inbox_id: "abc12345" })).resolves.toEqual({ requests: [] });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  test("uses environment defaults when constructor options are omitted", async () => {
    vi.stubEnv("HOOKRAY_BASE_URL", "https://env.example");
    vi.stubEnv("HOOKRAY_API_KEY", "hkr_live_env");
    fetchMock.mockResolvedValueOnce(jsonResponse({ requests: [] }));
    vi.stubGlobal("fetch", fetchMock);

    const client = new HookRayClient();

    await client.listRequests({ inbox_id: "abc12345" });
    const call = fetchMock.mock.calls[0];
    expect(call).toBeDefined();
    const [url, init] = call!;
    expect(url).toBe("https://env.example/api/v1/mcp/inbox/abc12345/requests");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer hkr_live_env");
  });
});
