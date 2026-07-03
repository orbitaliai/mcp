import { z } from "zod";

z.config({ jitless: true });

export const toolRuntimeMetadataSchema = z.enum([
  "callId",
  "sessionId",
  "agentId",
  "toolName",
  "fromNumber",
  "toNumber",
  "direction",
  "startedAt",
  "providerCallId"
]);
export type ToolRuntimeMetadata = z.infer<typeof toolRuntimeMetadataSchema>;

export const agentStatusSchema = z.enum(["active", "inactive", "draft"]);
export type AgentStatus = z.infer<typeof agentStatusSchema>;

export const agentTypeSchema = z.enum(["static", "http", "webhook"]);
export type AgentType = z.infer<typeof agentTypeSchema>;

export const agentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  status: agentStatusSchema,
  agentType: agentTypeSchema,
  language: z.string().min(2),
  voiceName: z.string().min(1),
  serverUrl: z.string().nullable(),
  serverHeaders: z.record(z.string(), z.string()),
  serverSecret: z.string().nullable(),
  handoffPhoneNumber: z.string().nullable(),
  phoneNumber: z.string().nullable(),
  toolCount: z.number().int().nonnegative(),
  knowledgeDocumentCount: z.number().int().nonnegative(),
  callsToday: z.number().int().nonnegative(),
  successRate: z.number().nonnegative(),
  backgroundSound: z.string(),
  updatedAt: z.iso.datetime()
});
export type Agent = z.infer<typeof agentSchema>;

export const promptTypeSchema = z.enum(["static", "dynamic"]);
export type PromptType = z.infer<typeof promptTypeSchema>;

export const greetingTypeSchema = z.enum(["static", "dynamic", "none"]);
export type GreetingType = z.infer<typeof greetingTypeSchema>;

export const agentPromptFieldsBaseSchema = z.object({
  promptType: promptTypeSchema,
  identity: z.string().trim().max(12000),
  instructions: z.string().trim().max(24000),
  greetingType: greetingTypeSchema,
  staticGreeting: z.string().trim().max(1000).nullable(),
  outboundGreeting: z.string().trim().max(1000).nullable()
});

export const agentPromptFieldsSchema = agentPromptFieldsBaseSchema.superRefine((value, context) => {
  if (value.greetingType === "dynamic" && value.promptType !== "dynamic") {
    context.addIssue({
      code: "custom",
      path: ["greetingType"],
      message: "Dynamic greeting requires dynamic prompt mode"
    });
  }

  if (value.greetingType === "static" && !value.staticGreeting?.trim()) {
    context.addIssue({
      code: "custom",
      path: ["staticGreeting"],
      message: "Static greeting is required"
    });
  }
});
export type AgentPromptFields = z.infer<typeof agentPromptFieldsSchema>;

export const toolOnErrorSchema = z.enum(["return_error", "return_empty"]);
export type ToolOnError = z.infer<typeof toolOnErrorSchema>;

export const agentToolSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(1000),
  parameterSchema: z.record(z.string(), z.unknown()),
  responseSchema: z.record(z.string(), z.unknown()).nullable(),
  timeoutMs: z.number().int().min(1000).max(30000),
  onError: toolOnErrorSchema,
  enabled: z.boolean(),
  toolUrl: z.string().trim().url().nullable().default(null),
  toolMethod: z.enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"]).default("POST"),
  toolHeaders: z.record(z.string(), z.string()).default({}),
  toolStaticParams: z.record(z.string(), z.unknown()).default({}),
  toolContentType: z.enum(["application/json"]).nullable().default("application/json"),
  toolRuntimeMetadata: z.array(toolRuntimeMetadataSchema).default([])
});
export type AgentTool = z.infer<typeof agentToolSchema>;

export const agentToolInputSchema = agentToolSchema.omit({ id: true });
export type AgentToolInput = z.infer<typeof agentToolInputSchema>;

export const agentPhoneNumberAssignmentSchema = z.object({
  phoneNumberId: z.uuid(),
  handoffPhoneNumber: z.string().trim().max(32).nullable().optional()
});
export type AgentPhoneNumberAssignment = z.infer<typeof agentPhoneNumberAssignmentSchema>;

export const agentServerFieldsSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120),
  language: z.string().trim().min(2).max(16),
  voiceName: z.string().trim().min(1).max(80),
  phoneNumberIds: z.array(z.uuid()).max(25).optional(),
  phoneNumberAssignments: z.array(agentPhoneNumberAssignmentSchema).max(25).default([]),
  serverUrl: z.url().nullable(),
  serverHeaders: z.record(z.string(), z.string()),
  serverSecret: z.string().trim().max(500).nullable(),
  handoffPhoneNumber: z.string().trim().max(32).nullable(),
  backgroundSound: z.preprocess(
    (val) => (typeof val === "string" && val.trim() === "" ? undefined : val),
    z.string().trim().max(50).default("none")
  )
});

export const agentCreateServerFieldsSchema = agentServerFieldsSchema.extend({
  agentType: agentTypeSchema.default("webhook")
});

export const createAgentRequestSchema = agentCreateServerFieldsSchema.and(agentPromptFieldsSchema).superRefine((value, context) => {
  if (value.promptType === "dynamic" && !value.serverUrl) {
    context.addIssue({
      code: "custom",
      path: ["serverUrl"],
      message: "Server URL is required for dynamic prompts"
    });
  }
  if ((value.agentType === "static" || value.agentType === "http") && value.promptType === "dynamic") {
    context.addIssue({
      code: "custom",
      path: ["promptType"],
      message: "Static and HTTP agents cannot use dynamic prompts"
    });
  }
});
export type CreateAgentRequest = z.infer<typeof createAgentRequestSchema>;

export const updateAgentServerFieldsSchema = agentServerFieldsSchema.extend({
  status: agentStatusSchema
});

export const patchAgentRequestSchema = updateAgentServerFieldsSchema.merge(agentPromptFieldsBaseSchema).partial().extend({
  expectedUpdatedAt: z.iso.datetime()
});
export type PatchAgentRequest = z.infer<typeof patchAgentRequestSchema>;
