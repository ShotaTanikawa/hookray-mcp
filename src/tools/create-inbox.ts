import {
  CreateWebhookInboxInputSchema,
  CreateWebhookInboxOutputSchema,
  type CreateWebhookInboxOutput,
} from "../schemas.js";
import { getClient, type ToolContext } from "./context.js";

export const createWebhookInboxTool = {
  name: "create_webhook_inbox",
  description: "Create a new HookRay webhook inbox and return its public capture URL.",
  inputSchema: CreateWebhookInboxInputSchema,
  outputSchema: CreateWebhookInboxOutputSchema,
  handler: async (input: unknown, context?: ToolContext): Promise<CreateWebhookInboxOutput> => {
    const parsedInput = CreateWebhookInboxInputSchema.parse(input);
    const output = await getClient(context).createInbox(parsedInput);
    return CreateWebhookInboxOutputSchema.parse(output);
  },
};
