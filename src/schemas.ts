import { z } from "zod/v4";

export const HttpMethodSchema = z.enum(["GET", "POST", "PUT", "PATCH", "DELETE"]);

export const HeaderRecordSchema = z.record(z.string(), z.string());

export const CreateWebhookInboxInputSchema = z.object({
  persistent: z
    .boolean()
    .default(false)
    .describe(
      "If true, the inbox does not expire (requires Pro plan / API key). Default: false.",
    ),
});

// Timestamps from the HookRay backend are Postgres timestamptz values
// serialized with a numeric offset and microseconds
// (e.g. "2026-05-22T08:13:55.528+00:00"), which zod's strict
// .datetime() (Z-only) rejects. These are our own backend's responses,
// not untrusted input, so output-side timestamps stay plain strings.
export const CreateWebhookInboxOutputSchema = z.object({
  inbox_id: z.string().describe("8-char slug, e.g. abc12345"),
  url: z.string().url().describe("Full HTTPS URL to POST webhooks to"),
  expires_at: z.string().optional().describe("ISO 8601 timestamp"),
  max_requests: z.number().int().optional(),
});

export const ListRequestsInputSchema = z.object({
  inbox_id: z.string(),
  limit: z.number().int().min(1).max(500).default(20),
  method: HttpMethodSchema.optional(),
  since: z.string().optional().describe("Only return requests after this ISO 8601 timestamp"),
  search: z.string().optional().describe("Substring match on request body"),
});

export const RequestSummarySchema = z.object({
  request_id: z.string(),
  method: z.string(),
  captured_at: z.string().describe("ISO 8601 timestamp"),
  content_type: z.string().optional(),
  body_preview: z.string().optional().describe("First 200 chars of body"),
});

export const ListRequestsOutputSchema = z.object({
  requests: z.array(RequestSummarySchema),
});

export const InspectRequestInputSchema = z.object({
  inbox_id: z.string(),
  request_id: z.string(),
});

export const InspectRequestOutputSchema = z.object({
  method: z.string(),
  headers: HeaderRecordSchema,
  body: z.string(),
  query_params: HeaderRecordSchema,
  content_type: z.string().optional(),
  captured_at: z.string().optional().describe("ISO 8601 timestamp"),
  source_ip: z.string().optional(),
});

export const WaitForRequestInputSchema = z.object({
  inbox_id: z.string(),
  timeout_seconds: z.number().int().min(1).max(300).default(60),
  since: z
    .string()
    .optional()
    .describe("Only consider requests captured after this ISO 8601 timestamp. Default: now."),
});

export const WaitForRequestTimeoutOutputSchema = z.object({
  timeout: z.literal(true),
});

export const WaitForRequestOutputSchema = z.union([
  InspectRequestOutputSchema,
  WaitForRequestTimeoutOutputSchema,
]);

export const ReplayRequestInputSchema = z.object({
  inbox_id: z.string(),
  request_id: z.string(),
  destination_url: z
    .string()
    .url()
    .describe(
      "Where to forward the captured request. Any URL reachable from the user's machine is allowed.",
    ),
  override_method: HttpMethodSchema.optional().describe("Override the original request method."),
  timeout_seconds: z.number().int().min(1).max(60).default(10),
});

export const ReplayRequestOutputSchema = z.object({
  status_code: z.number().int(),
  response_body_preview: z.string().describe("First 10 KB of the response body"),
  response_headers: HeaderRecordSchema,
  latency_ms: z.number().int(),
});

export type HttpMethod = z.infer<typeof HttpMethodSchema>;
export type HeaderRecord = z.infer<typeof HeaderRecordSchema>;

export type CreateWebhookInboxInput = z.infer<typeof CreateWebhookInboxInputSchema>;
export type CreateWebhookInboxOutput = z.infer<typeof CreateWebhookInboxOutputSchema>;

export type ListRequestsInput = z.infer<typeof ListRequestsInputSchema>;
export type RequestSummary = z.infer<typeof RequestSummarySchema>;
export type ListRequestsOutput = z.infer<typeof ListRequestsOutputSchema>;

export type InspectRequestInput = z.infer<typeof InspectRequestInputSchema>;
export type InspectRequestOutput = z.infer<typeof InspectRequestOutputSchema>;

export type WaitForRequestInput = z.infer<typeof WaitForRequestInputSchema>;
export type WaitForRequestTimeoutOutput = z.infer<typeof WaitForRequestTimeoutOutputSchema>;
export type WaitForRequestOutput = z.infer<typeof WaitForRequestOutputSchema>;

export type ReplayRequestInput = z.infer<typeof ReplayRequestInputSchema>;
export type ReplayRequestOutput = z.infer<typeof ReplayRequestOutputSchema>;
