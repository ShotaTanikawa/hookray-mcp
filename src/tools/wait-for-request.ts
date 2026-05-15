import {
  WaitForRequestInputSchema,
  WaitForRequestOutputSchema,
  type WaitForRequestOutput,
} from "../schemas.js";
import { getClient, type ToolContext } from "./context.js";

export const waitForRequestTool = {
  name: "wait_for_request",
  description: "Block until a new webhook arrives at an inbox, or return a timeout result.",
  inputSchema: WaitForRequestInputSchema,
  outputSchema: WaitForRequestOutputSchema,
  handler: async (input: unknown, context?: ToolContext): Promise<WaitForRequestOutput> => {
    const parsedInput = WaitForRequestInputSchema.parse(input);
    const output = await getClient(context).waitForRequest(parsedInput);
    return WaitForRequestOutputSchema.parse(output);
  },
};
