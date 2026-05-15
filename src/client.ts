import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";

const DEFAULT_BASE_URL = "https://hookray.com";
const DEFAULT_RETRY_DELAY_MS = 1_000;

export type HttpMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export type HeaderRecord = Record<string, string>;

export type CreateInboxInput = {
  persistent?: boolean;
};

export type CreateInboxOutput = {
  inbox_id: string;
  url: string;
  expires_at?: string;
  max_requests?: number;
};

export type ListRequestsInput = {
  inbox_id: string;
  limit?: number;
  method?: HttpMethod;
  since?: string;
  search?: string;
};

export type RequestSummary = {
  request_id: string;
  method: string;
  captured_at: string;
  content_type?: string;
  body_preview?: string;
};

export type ListRequestsOutput = {
  requests: RequestSummary[];
};

export type InspectRequestInput = {
  inbox_id: string;
  request_id: string;
};

export type InspectRequestOutput = {
  method: string;
  headers: HeaderRecord;
  body: string;
  query_params: HeaderRecord;
  content_type?: string;
  captured_at?: string;
  source_ip?: string;
};

export type WaitForRequestInput = {
  inbox_id: string;
  timeout_seconds?: number;
  since?: string;
};

export type WaitForRequestOutput = InspectRequestOutput | { timeout: true };

export type HookRayClientOptions = {
  baseUrl?: string;
  apiKey?: string;
  fetchImpl?: typeof fetch;
  retryDelayMs?: number;
};

export class HookRayClient {
  private readonly apiKey: string | undefined;
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retryDelayMs: number;

  constructor(options: HookRayClientOptions = {}) {
    this.baseUrl = normalizeBaseUrl(options.baseUrl ?? process.env.HOOKRAY_BASE_URL ?? DEFAULT_BASE_URL);
    this.apiKey = options.apiKey ?? process.env.HOOKRAY_API_KEY;
    this.fetchImpl = options.fetchImpl ?? getGlobalFetch();
    this.retryDelayMs = options.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS;
  }

  async createInbox(input: CreateInboxInput = {}): Promise<CreateInboxOutput> {
    return this.requestJson<CreateInboxOutput>("/api/v1/mcp/inbox", {
      method: "POST",
      body: JSON.stringify({ persistent: input.persistent ?? false }),
    });
  }

  async listRequests(input: ListRequestsInput): Promise<ListRequestsOutput> {
    return this.requestJson<ListRequestsOutput>(
      this.url(`/api/v1/mcp/inbox/${encodeURIComponent(input.inbox_id)}/requests`, {
        limit: input.limit,
        method: input.method,
        since: input.since,
        search: input.search,
      }),
      { method: "GET" },
    );
  }

  async inspectRequest(input: InspectRequestInput): Promise<InspectRequestOutput> {
    return this.requestJson<InspectRequestOutput>(
      `/api/v1/mcp/inbox/${encodeURIComponent(input.inbox_id)}/requests/${encodeURIComponent(input.request_id)}`,
      { method: "GET" },
    );
  }

  async waitForRequest(input: WaitForRequestInput): Promise<WaitForRequestOutput> {
    return this.requestJson<WaitForRequestOutput>(
      this.url(`/api/v1/mcp/inbox/${encodeURIComponent(input.inbox_id)}/wait`, {
        timeout: input.timeout_seconds,
        since: input.since,
      }),
      { method: "GET" },
    );
  }

  private url(path: string, query: Record<string, string | number | undefined> = {}): string {
    const url = new URL(path, `${this.baseUrl}/`);
    for (const [key, value] of Object.entries(query)) {
      if (value !== undefined) {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async requestJson<T>(pathOrUrl: string, init: RequestInit): Promise<T> {
    const response = await this.fetchWithRetry(this.url(pathOrUrl), this.withDefaultHeaders(init));
    if (!response.ok) {
      throw await this.mapHttpError(response);
    }

    try {
      return (await response.json()) as T;
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown JSON parse error";
      throw new McpError(ErrorCode.InternalError, `HookRay returned invalid JSON: ${message}`);
    }
  }

  private async fetchWithRetry(url: string, init: RequestInit): Promise<Response> {
    try {
      return await this.fetchImpl(url, init);
    } catch (firstError) {
      await delay(this.retryDelayMs);
      try {
        return await this.fetchImpl(url, init);
      } catch (secondError) {
        throw new McpError(
          ErrorCode.InternalError,
          `Network error contacting HookRay: ${errorMessage(secondError, firstError)}`,
        );
      }
    }
  }

  private withDefaultHeaders(init: RequestInit): RequestInit {
    const headers = new Headers(init.headers);
    if (this.apiKey) {
      headers.set("authorization", `Bearer ${this.apiKey}`);
    }
    if (init.body !== undefined && !headers.has("content-type")) {
      headers.set("content-type", "application/json");
    }
    return { ...init, headers };
  }

  private async mapHttpError(response: Response): Promise<McpError> {
    if (response.status === 401) {
      return new McpError(
        ErrorCode.InvalidRequest,
        "Invalid or missing HOOKRAY_API_KEY. Get one at https://hookray.com/app/settings/api-keys",
      );
    }
    if (response.status === 403) {
      return new McpError(
        ErrorCode.InvalidRequest,
        "This feature requires HookRay Pro. Upgrade at https://hookray.com/pricing",
      );
    }
    if (response.status === 429) {
      return new McpError(
        ErrorCode.InvalidRequest,
        "HookRay rate limit reached. Wait a few seconds or upgrade to Pro.",
      );
    }

    const body = await response.text().catch(() => "");
    const suffix = body ? `: ${body}` : "";
    return new McpError(
      ErrorCode.InternalError,
      `HookRay request failed with HTTP ${response.status}${suffix}`,
    );
  }
}

const normalizeBaseUrl = (baseUrl: string): string => baseUrl.replace(/\/+$/, "");

const getGlobalFetch = (): typeof fetch => {
  if (typeof fetch === "undefined") {
    throw new McpError(ErrorCode.InternalError, "This package requires Node 20+ native fetch.");
  }
  return fetch;
};

const delay = async (ms: number): Promise<void> => {
  if (ms <= 0) {
    return;
  }
  await new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
};

const errorMessage = (error: unknown, fallback: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (fallback instanceof Error) {
    return fallback.message;
  }
  return "unknown network error";
};
