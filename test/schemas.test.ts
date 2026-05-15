import { describe, expect, test } from "vitest";

import {
  CreateWebhookInboxInputSchema,
  CreateWebhookInboxOutputSchema,
  InspectRequestOutputSchema,
  ListRequestsInputSchema,
  ReplayRequestInputSchema,
  WaitForRequestInputSchema,
  WaitForRequestOutputSchema,
} from "../src/schemas.js";

describe("tool input schemas", () => {
  test("apply defaults from the tool spec", () => {
    expect(CreateWebhookInboxInputSchema.parse({})).toEqual({ persistent: false });
    expect(ListRequestsInputSchema.parse({ inbox_id: "abc12345" })).toEqual({
      inbox_id: "abc12345",
      limit: 20,
    });
    expect(WaitForRequestInputSchema.parse({ inbox_id: "abc12345" })).toEqual({
      inbox_id: "abc12345",
      timeout_seconds: 60,
    });
    expect(
      ReplayRequestInputSchema.parse({
        inbox_id: "abc12345",
        request_id: "req_1",
        destination_url: "http://localhost:3000/api/webhook",
      }),
    ).toEqual({
      inbox_id: "abc12345",
      request_id: "req_1",
      destination_url: "http://localhost:3000/api/webhook",
      timeout_seconds: 10,
    });
  });

  test("enforces numeric limits", () => {
    expect(() => ListRequestsInputSchema.parse({ inbox_id: "abc12345", limit: 0 })).toThrow();
    expect(() => ListRequestsInputSchema.parse({ inbox_id: "abc12345", limit: 501 })).toThrow();
    expect(() => WaitForRequestInputSchema.parse({ inbox_id: "abc12345", timeout_seconds: 301 })).toThrow();
    expect(() =>
      ReplayRequestInputSchema.parse({
        inbox_id: "abc12345",
        request_id: "req_1",
        destination_url: "http://localhost:3000/api/webhook",
        timeout_seconds: 61,
      }),
    ).toThrow();
  });

  test("accepts only supported HTTP methods", () => {
    expect(ListRequestsInputSchema.parse({ inbox_id: "abc12345", method: "POST" }).method).toBe("POST");
    expect(
      ReplayRequestInputSchema.parse({
        inbox_id: "abc12345",
        request_id: "req_1",
        destination_url: "http://localhost:3000/api/webhook",
        override_method: "PATCH",
      }).override_method,
    ).toBe("PATCH");
    expect(() => ListRequestsInputSchema.parse({ inbox_id: "abc12345", method: "HEAD" })).toThrow();
  });

  test("requires replay destination URL syntax while allowing local network targets", () => {
    expect(
      ReplayRequestInputSchema.parse({
        inbox_id: "abc12345",
        request_id: "req_1",
        destination_url: "http://192.168.1.10:3000/webhook",
      }).destination_url,
    ).toBe("http://192.168.1.10:3000/webhook");
    expect(() =>
      ReplayRequestInputSchema.parse({
        inbox_id: "abc12345",
        request_id: "req_1",
        destination_url: "not-a-url",
      }),
    ).toThrow();
  });
});

describe("tool output schemas", () => {
  test("parses create inbox and inspect request outputs", () => {
    expect(
      CreateWebhookInboxOutputSchema.parse({
        inbox_id: "abc12345",
        url: "https://hookray.com/h/abc12345",
        expires_at: "2026-05-15T00:00:00.000Z",
        max_requests: 100,
      }),
    ).toEqual({
      inbox_id: "abc12345",
      url: "https://hookray.com/h/abc12345",
      expires_at: "2026-05-15T00:00:00.000Z",
      max_requests: 100,
    });

    expect(
      InspectRequestOutputSchema.parse({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{\"ok\":true}",
        query_params: { event: "created" },
        content_type: "application/json",
        captured_at: "2026-05-15T00:00:00.000Z",
        source_ip: "203.0.113.10",
      }).headers["content-type"],
    ).toBe("application/json");
  });

  test("wait output accepts timeout or full request details", () => {
    expect(WaitForRequestOutputSchema.parse({ timeout: true })).toEqual({ timeout: true });
    const requestOutput = WaitForRequestOutputSchema.parse({
      method: "GET",
      headers: {},
      body: "",
      query_params: {},
    });
    expect("method" in requestOutput ? requestOutput.method : undefined).toBe("GET");
  });
});
