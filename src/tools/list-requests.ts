import {
  ListRequestsInputSchema,
  ListRequestsOutputSchema,
  type ListRequestsOutput,
} from "../schemas.js";
import { getClient, type ToolContext } from "./context.js";

export const listRequestsTool = {
  name: "list_requests",
  description: "List webhook requests captured by a HookRay inbox.",
  inputSchema: ListRequestsInputSchema,
  outputSchema: ListRequestsOutputSchema,
  handler: async (input: unknown, context?: ToolContext): Promise<ListRequestsOutput> => {
    const parsedInput = ListRequestsInputSchema.parse(input);
    const output = await getClient(context).listRequests(parsedInput);
    return ListRequestsOutputSchema.parse(output);
  },
};
