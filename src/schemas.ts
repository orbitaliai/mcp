import {
  agentCreateServerFieldsSchema,
  agentTypeSchema,
  agentLogSeveritySchema,
  agentPromptFieldsBaseSchema,
  agentToolInputSchema,
  createKnowledgeDocumentRequestSchema,
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
const knowledgeFilePathSchema = z
  .string()
  .trim()
  .min(1)
  .refine((value) => /\.(txt|md|pdf)$/i.test(value), {
    message: "Knowledge file must be a .txt, .md, or .pdf file"
  })
  .describe("Local path to a .txt, .md, or .pdf file to upload as multipart/form-data.");

export const listAgentToolsInputSchema = z.object({
  agentId: agentIdSchema
});

export const getOrCreateAgentInputSchema = agentCreateServerFieldsSchema
  .extend({
    agentType: agentTypeSchema
  })
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
  tools: z.array(agentToolInputSchema).min(1).max(25).describe("Custom tools to create when a tool of the same name does not already exist."),
  updateExisting: z
    .boolean()
    .optional()
    .describe("When true, replace existing tools with matching names instead of leaving them untouched.")
});

export const updateAgentToolInputSchema = agentToolInputSchema.extend({
  agentId: agentIdSchema,
  toolId: z.uuid().describe("The Orbitali tool id (UUID).")
});

export const deleteAgentToolInputSchema = z.object({
  agentId: agentIdSchema,
  toolId: z.uuid().describe("The Orbitali tool id (UUID).")
});

export const createRealtimeSessionInputSchema = z.object({
  agentId: agentIdSchema
});

export const listKnowledgeDocumentsInputSchema = z.object({
  agentId: agentIdSchema
});

export const uploadKnowledgeDocumentInputSchema = z
  .object({
    agentId: agentIdSchema,
    name: createKnowledgeDocumentRequestSchema.shape.name,
    description: createKnowledgeDocumentRequestSchema.shape.description,
    content: createKnowledgeDocumentRequestSchema.shape.content.optional().describe("Document text or Markdown to upload as JSON."),
    filePath: knowledgeFilePathSchema.optional()
  })
  .superRefine((value, context) => {
    if (value.content && value.filePath) {
      context.addIssue({
        code: "custom",
        path: ["filePath"],
        message: "Provide either content or filePath, not both"
      });
    }

    if (!value.content && !value.filePath) {
      context.addIssue({
        code: "custom",
        path: ["content"],
        message: "Provide content or filePath"
      });
    }
  });

export const deleteKnowledgeDocumentInputSchema = z.object({
  agentId: agentIdSchema,
  documentId: z.uuid().describe("The Orbitali knowledge document id (UUID).")
});

export const assignPhoneNumberInputSchema = z.object({
  agentId: agentIdSchema,
  phoneNumberId: z.uuid().describe("The Orbitali phone number id (UUID) to assign."),
  handoffPhoneNumber: z
    .string()
    .trim()
    .max(32)
    .nullable()
    .optional()
    .describe("Optional E.164 number that calls on this phone number can be handed off to.")
});

export const unassignPhoneNumberInputSchema = z.object({
  agentId: agentIdSchema,
  phoneNumberId: z.uuid().describe("The Orbitali phone number id (UUID) to unassign.")
});

export const listCallsInputSchema = z.object({
  agentId: agentIdSchema.optional().describe("Only return calls handled by this agent."),
  limit: z.number().int().min(1).max(100).optional().describe("Maximum number of calls to return (default 25).")
});

export const getCallInputSchema = z.object({
  callId: z.uuid().describe("The Orbitali call id (UUID).")
});

export const listAgentLogsInputSchema = z.object({
  agentId: agentIdSchema,
  limit: z.number().int().min(1).max(100).optional().describe("Maximum number of log entries to return (default 25)."),
  offset: z.number().int().nonnegative().optional().describe("Number of log entries to skip for pagination."),
  severity: agentLogSeveritySchema.optional().describe("Only return logs with this severity."),
  sessionId: z
    .string()
    .regex(/^[0-9a-zA-Z]{6}$/)
    .optional()
    .describe("Only return logs from this 6-character session id.")
});

export type GetOrCreateAgentInput = z.infer<typeof getOrCreateAgentInputSchema>;
export type PatchAgentInput = z.infer<typeof patchAgentInputSchema>;
export type EnsureAgentToolsInput = z.infer<typeof ensureAgentToolsInputSchema>;
export type UpdateAgentToolInput = z.infer<typeof updateAgentToolInputSchema>;
export type UploadKnowledgeDocumentInput = z.infer<typeof uploadKnowledgeDocumentInputSchema>;
export type AssignPhoneNumberInput = z.infer<typeof assignPhoneNumberInputSchema>;
export type ListCallsInput = z.infer<typeof listCallsInputSchema>;
export type ListAgentLogsInput = z.infer<typeof listAgentLogsInputSchema>;

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
