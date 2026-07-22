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

export const agentTypeSchema = z
  .enum(["static", "http", "webhook"])
  .describe(
    "Required integration architecture. Use static for a stored prompt with no custom tools, http when each custom tool calls its own HTTP endpoint, or webhook when one serverUrl handles tool events and optional dynamic prompts. The type cannot be changed after creation."
  );
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
  toolUrl: z
    .string()
    .trim()
    .url({ protocol: /^https$/ })
    .nullable()
    .default(null)
    .describe("HTTPS endpoint called for an HTTP agent tool; required for HTTP agents and null for webhook tools."),
  toolMethod: z
    .enum(["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"])
    .default("POST")
    .describe("HTTP method used with toolUrl for an HTTP agent tool."),
  toolHeaders: z
    .record(z.string(), z.string())
    .default({})
    .describe("Headers sent to toolUrl for an HTTP agent tool. Keep credentials in server-side configuration."),
  toolStaticParams: z.record(z.string(), z.unknown()).default({}),
  toolContentType: z.enum(["application/json"]).nullable().default("application/json"),
  toolRuntimeMetadata: z.array(toolRuntimeMetadataSchema).default([])
});
export type AgentTool = z.infer<typeof agentToolSchema>;

export const agentToolInputSchema = agentToolSchema.omit({ id: true });
export type AgentToolInput = z.infer<typeof agentToolInputSchema>;

export const mcpIntegrationToolSchema = z.looseObject({
  name: z.string().trim().min(1)
});

export const mcpIntegrationSchema = z.object({
  id: z.uuid(),
  organizationId: z.uuid(),
  name: z.string(),
  url: z.url(),
  status: z.enum(["pending", "active", "inactive"]),
  authType: z.enum(["none", "headers", "oauth2"]),
  cachedTools: z.array(mcpIntegrationToolSchema),
  cachedToolsAt: z.iso.datetime().nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime()
});
export type McpIntegration = z.infer<typeof mcpIntegrationSchema>;

export const agentMcpToolSchema = z.object({
  id: z.uuid(),
  agentId: z.uuid(),
  mcpServerId: z.uuid(),
  toolName: z.string().trim().min(1),
  enabled: z.boolean()
});
export type AgentMcpTool = z.infer<typeof agentMcpToolSchema>;

export const agentMcpToolSelectionSchema = agentMcpToolSchema.omit({ id: true, agentId: true });
export type AgentMcpToolSelection = z.infer<typeof agentMcpToolSelectionSchema>;

export const knowledgeDocumentSchema = z.object({
  id: z.uuid(),
  name: z.string().min(1),
  description: z.string().nullable(),
  type: z.string().min(1),
  sizeBytes: z.number().int().nonnegative(),
  status: z.string().min(1),
  error: z.string().nullable(),
  chunkCount: z.number().int().nonnegative(),
  createdAt: z.iso.datetime()
});
export type KnowledgeDocument = z.infer<typeof knowledgeDocumentSchema>;

export const createKnowledgeDocumentRequestSchema = z.object({
  name: z.string().trim().min(1, "Name is required").max(120).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  content: z.string().min(1, "Content is required").max(1_000_000)
});
export type CreateKnowledgeDocumentRequest = z.infer<typeof createKnowledgeDocumentRequestSchema>;

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

export const phoneNumberSchema = z.object({
  id: z.uuid(),
  phoneNumber: z.string().min(1),
  friendlyName: z.string().min(1),
  status: z.enum(["claimed", "available", "released", "suspended"]),
  source: z.enum(["managed", "user"]),
  provider: z.enum(["telnyx", "twilio"]),
  setupStatus: z.enum(["configured", "setup_required", "pending_verification"]),
  assignedAgentId: z.uuid().nullable(),
  assignedAgentName: z.string().nullable(),
  countryCode: z.string().min(2)
});
export type PhoneNumber = z.infer<typeof phoneNumberSchema>;

export const agentAssignedPhoneNumberSchema = z.object({
  phoneNumberId: z.uuid(),
  phoneNumber: z.string().min(1),
  friendlyName: z.string().min(1),
  handoffPhoneNumber: z.string().nullable()
});
export type AgentAssignedPhoneNumber = z.infer<typeof agentAssignedPhoneNumberSchema>;

export const callStatusSchema = z.enum(["completed", "active", "failed"]);
export type CallStatus = z.infer<typeof callStatusSchema>;

export const callSummarySchema = z.object({
  id: z.uuid(),
  agentName: z.string().min(1),
  fromNumber: z.string().min(1),
  toNumber: z.string().min(1),
  status: callStatusSchema,
  durationSeconds: z.number().int().nonnegative(),
  startedAt: z.iso.datetime(),
  toolInvocations: z.number().int().nonnegative(),
  usageCostEur: z.number().nonnegative()
});
export type CallSummary = z.infer<typeof callSummarySchema>;

export const callMessageSchema = z.object({
  id: z.uuid(),
  role: z.string().min(1),
  content: z.string(),
  occurredAt: z.iso.datetime()
});
export type CallMessage = z.infer<typeof callMessageSchema>;

export const callToolInvocationSchema = z.object({
  id: z.uuid(),
  agentToolId: z.uuid().nullable(),
  toolName: z.string().min(1),
  request: z.unknown(),
  response: z.string().nullable(),
  status: z.string().min(1),
  durationMs: z.number().int().nonnegative(),
  createdAt: z.iso.datetime()
});
export type CallToolInvocation = z.infer<typeof callToolInvocationSchema>;

export const llmUsageSchema = z.object({
  id: z.uuid(),
  model: z.string().min(1),
  promptTokens: z.number().int().nonnegative(),
  cachedTokens: z.number().int().nonnegative(),
  responseTokens: z.number().int().nonnegative(),
  toolTokens: z.number().int().nonnegative(),
  thoughtTokens: z.number().int().nonnegative(),
  totalTokens: z.number().int().nonnegative(),
  estimatedCostUsd: z.number().nonnegative().nullable(),
  rawProviderData: z.unknown().nullable(),
  createdAt: z.iso.datetime()
});
export type LlmUsage = z.infer<typeof llmUsageSchema>;

export const callDetailSchema = callSummarySchema.extend({
  summary: z.string().nullable(),
  messages: z.array(callMessageSchema),
  toolInvocationsLog: z.array(callToolInvocationSchema),
  llmUsage: z.array(llmUsageSchema)
});
export type CallDetail = z.infer<typeof callDetailSchema>;

export const agentLogSeveritySchema = z.enum(["debug", "info", "warn", "error"]);
export type AgentLogSeverity = z.infer<typeof agentLogSeveritySchema>;

export const agentLogSessionIdSchema = z.string().regex(/^[0-9a-zA-Z]{6}$/);

export const agentLogSchema = z.object({
  id: z.uuid(),
  accountId: z.uuid(),
  agentId: z.uuid(),
  sessionId: agentLogSessionIdSchema,
  timestamp: z.iso.datetime(),
  severity: agentLogSeveritySchema,
  content: z.unknown()
});
export type AgentLog = z.infer<typeof agentLogSchema>;

export const agentLogsResponseSchema = z.object({
  logs: z.array(agentLogSchema),
  pagination: z.object({
    limit: z.number().int().positive(),
    offset: z.number().int().nonnegative(),
    hasNextPage: z.boolean(),
    hasPreviousPage: z.boolean()
  })
});
export type AgentLogsResponse = z.infer<typeof agentLogsResponseSchema>;
