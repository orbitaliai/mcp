import {
  agentCreateServerFieldsSchema,
  agentPromptFieldsBaseSchema,
  agentToolInputSchema,
  patchAgentRequestSchema
} from "./types";
import { z } from "zod";

/**
 * MCP-facing input schemas.
 *
 * These are intentionally thin wrappers over the Orbitali public API
 * contracts. The REST API remains the source of truth for validation, so
 * cross-field refinements are enforced server-side; here we only advertise the
 * argument shape to the calling agent and apply defaults.
 */

const agentIdSchema = z.uuid().describe("The Orbitali agent id (UUID).");

export const listAgentToolsInputSchema = z.object({
  agentId: agentIdSchema
});

export const getOrCreateAgentInputSchema = agentCreateServerFieldsSchema
  .extend(agentPromptFieldsBaseSchema.shape)
  .extend({
    reuseExisting: z
      .boolean()
      .default(true)
      .describe("Reuse an existing agent that matches name, agentType, language, voiceName, and serverUrl.")
  });

export const patchAgentInputSchema = patchAgentRequestSchema.extend({
  agentId: agentIdSchema
});

export const ensureAgentToolsInputSchema = z.object({
  agentId: agentIdSchema,
  tools: z.array(agentToolInputSchema).min(1).max(25).describe("Custom tools to create when a tool of the same name does not already exist.")
});

export const createRealtimeSessionInputSchema = z.object({
  agentId: agentIdSchema
});

export type GetOrCreateAgentInput = z.infer<typeof getOrCreateAgentInputSchema>;
export type PatchAgentInput = z.infer<typeof patchAgentInputSchema>;
export type EnsureAgentToolsInput = z.infer<typeof ensureAgentToolsInputSchema>;

export function duplicateToolNameMessages(tools: EnsureAgentToolsInput["tools"]): string[] {
  const seen = new Map<string, number>();
  const messages: string[] = [];

  tools.forEach((tool, index) => {
    const firstIndex = seen.get(tool.name);
    if (firstIndex !== undefined) {
      messages.push(`Duplicate tool name "${tool.name}" also appears at tools.${firstIndex}.name`);
      return;
    }

    seen.set(tool.name, index);
  });

  return messages;
}
