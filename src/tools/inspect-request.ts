import {
  InspectRequestInputSchema,
  InspectRequestOutputSchema,
  type InspectRequestOutput,
} from "../schemas.js";
import { getClient, type ToolContext } from "./context.js";

export const inspectRequestTool = {
  name: "inspect_request",
  description: "Inspect the full headers, body, query params, and metadata for a captured request.",
  inputSchema: InspectRequestInputSchema,
  outputSchema: InspectRequestOutputSchema,
  handler: async (input: unknown, context?: ToolContext): Promise<InspectRequestOutput> => {
    const parsedInput = InspectRequestInputSchema.parse(input);
    const output = await getClient(context).inspectRequest(parsedInput);
    return InspectRequestOutputSchema.parse(output);
  },
};
