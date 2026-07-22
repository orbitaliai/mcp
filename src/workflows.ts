import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";
import { OrbitaliApiError, type OrbitaliClient, type RealtimeSessionResponse } from "./client";
import type {
  AssignPhoneNumberInput,
  EnsureAgentToolsInput,
  GetOrCreateAgentInput,
  ListAgentLogsInput,
  ListCallsInput,
  PatchAgentInput,
  UpdateAgentToolInput,
  UploadKnowledgeDocumentInput
} from "./schemas";
import {
  createAgentRequestSchema,
  createKnowledgeDocumentRequestSchema,
  type Agent,
  type AgentAssignedPhoneNumber,
  type AgentLogsResponse,
  type AgentMcpTool,
  type AgentMcpToolSelection,
  type AgentTool,
  type AgentToolInput,
  type CallDetail,
  type CallSummary,
  type CreateAgentRequest,
  type KnowledgeDocument,
  type McpIntegration,
  type PhoneNumber
} from "./types";

const maxKnowledgeDocumentFileBytes = 1_000_000;

export interface GetOrCreateAgentResult {
  agentId: string;
  created: boolean;
  matchedAgent?: Agent;
  mcpTools?: AgentMcpTool[];
}

export interface ToolResult {
  name: string;
  id: string;
}

export interface EnsureAgentToolsResult {
  created: ToolResult[];
  existing: ToolResult[];
  updated: ToolResult[];
  failed: ToolFailure[];
}

export interface ToolFailure {
  name: string;
  error: string;
  status?: number;
  code?: string;
}

export function listAgents(client: OrbitaliClient): Promise<Agent[]> {
  return client.listAgents();
}

export function listAgentTools(client: OrbitaliClient, agentId: string): Promise<AgentTool[]> {
  return client.listAgentTools(agentId);
}

export function listMcpIntegrations(client: OrbitaliClient): Promise<McpIntegration[]> {
  return client.listMcpIntegrations();
}

export function listAgentMcpTools(client: OrbitaliClient, agentId: string): Promise<AgentMcpTool[]> {
  return client.listAgentMcpTools(agentId);
}

export function configureAgentMcpTools(
  client: OrbitaliClient,
  agentId: string,
  tools: AgentMcpToolSelection[]
): Promise<AgentMcpTool[]> {
  return client.setAgentMcpTools(agentId, tools);
}

export function listKnowledgeDocuments(client: OrbitaliClient, agentId: string): Promise<KnowledgeDocument[]> {
  return client.listKnowledgeDocuments(agentId);
}

/**
 * Reuses an existing agent when one matches on the identifying fields
 * (name, agentType, language, voiceName, serverUrl); otherwise creates a new
 * agent. Reuse can be disabled per call via `reuseExisting: false`.
 *
 * This is a client-side convenience workflow. The public API does not expose an
 * idempotency key or unique server-side constraint for these identifying fields,
 * so concurrent bootstraps can still create duplicates.
 */
export async function getOrCreateAgent(client: OrbitaliClient, input: GetOrCreateAgentInput): Promise<GetOrCreateAgentResult> {
  const { reuseExisting, mcpTools, ...createBody } = input;
  const request = createAgentRequestSchema.parse(createBody) as CreateAgentRequest;

  if (reuseExisting) {
    const agents = await client.listAgents();
    const matchedAgent = agents.find((agent) => isSameAgent(agent, request));

    if (matchedAgent) {
      const assignedMcpTools = mcpTools ? await client.setAgentMcpTools(matchedAgent.id, mcpTools) : undefined;
      return { agentId: matchedAgent.id, created: false, matchedAgent, ...(assignedMcpTools ? { mcpTools: assignedMcpTools } : {}) };
    }
  }

  const { id } = await client.createAgent(request);
  const assignedMcpTools = mcpTools ? await client.setAgentMcpTools(id, mcpTools) : undefined;
  return { agentId: id, created: true, ...(assignedMcpTools ? { mcpTools: assignedMcpTools } : {}) };
}

/**
 * Updates an agent through the public PATCH endpoint. API errors (including
 * optimistic-concurrency conflicts) surface as `OrbitaliApiError`.
 */
export async function patchAgent(client: OrbitaliClient, input: PatchAgentInput): Promise<{ id: string }> {
  const { agentId, ...patch } = input;
  return client.patchAgent(agentId, patch);
}

/**
 * Creates tools whose name is not already present on the agent.
 * Existing matching tools are left untouched unless updateExisting is true.
 */
export async function ensureAgentTools(client: OrbitaliClient, input: EnsureAgentToolsInput): Promise<EnsureAgentToolsResult> {
  const existingTools = await client.listAgentTools(input.agentId);
  const seenByName = new Map(existingTools.map((tool) => [tool.name, { name: tool.name, id: tool.id }]));

  const created: ToolResult[] = [];
  const existing: ToolResult[] = [];
  const updated: ToolResult[] = [];
  const failed: ToolFailure[] = [];

  for (const tool of input.tools) {
    const match = seenByName.get(tool.name);

    if (match) {
      if (input.updateExisting) {
        try {
          await client.updateAgentTool(input.agentId, match.id, tool);
          updated.push(match);
        } catch (error) {
          failed.push(toolFailure(tool.name, error));
        }
        continue;
      }

      existing.push(match);
      continue;
    }

    try {
      const { id } = await client.createAgentTool(input.agentId, tool);
      const result = { name: tool.name, id };
      created.push(result);
      seenByName.set(tool.name, result);
    } catch (error) {
      failed.push(toolFailure(tool.name, error));
    }
  }

  return { created, existing, updated, failed };
}

export function updateAgentTool(client: OrbitaliClient, input: UpdateAgentToolInput): Promise<{ id: string }> {
  const { agentId, toolId, id: _id, ...tool } = input as UpdateAgentToolInput & { id?: string };
  return client.updateAgentTool(agentId, toolId, tool as AgentToolInput);
}

export function deleteAgentTool(client: OrbitaliClient, agentId: string, toolId: string): Promise<{ id: string }> {
  return client.deleteAgentTool(agentId, toolId);
}

export async function uploadKnowledgeDocument(
  client: OrbitaliClient,
  input: UploadKnowledgeDocumentInput
): Promise<{ id: string; name: string; description: string | null }> {
  if (input.filePath) {
    const fileStats = await stat(input.filePath);
    if (fileStats.size > maxKnowledgeDocumentFileBytes) {
      throw new Error(`Knowledge file exceeds ${maxKnowledgeDocumentFileBytes} bytes`);
    }

    const fileBuffer = await readFile(input.filePath);
    return client.uploadKnowledgeFile(input.agentId, {
      fileName: basename(input.filePath),
      file: new Blob([fileBuffer]),
      name: input.name,
      description: input.description
    });
  }

  const request = createKnowledgeDocumentRequestSchema.parse({
    name: input.name,
    description: input.description,
    content: input.content
  });
  return client.uploadKnowledgeText(input.agentId, request);
}

export function deleteKnowledgeDocument(
  client: OrbitaliClient,
  agentId: string,
  documentId: string
): Promise<{ id: string }> {
  return client.deleteKnowledgeDocument(agentId, documentId);
}

export function createRealtimeSession(client: OrbitaliClient, agentId: string): Promise<RealtimeSessionResponse> {
  return client.createRealtimeSession(agentId);
}

export function listPhoneNumbers(client: OrbitaliClient): Promise<PhoneNumber[]> {
  return client.listPhoneNumbers();
}

/**
 * Assigns one phone number to an agent and returns the agent's resulting
 * assignments. The API moves the number if it was assigned to another agent.
 */
export async function assignPhoneNumber(
  client: OrbitaliClient,
  input: AssignPhoneNumberInput
): Promise<{ phoneNumberId: string; assignedPhoneNumbers: AgentAssignedPhoneNumber[] }> {
  const { agentId, ...assignment } = input;
  const { phoneNumberId } = await client.assignPhoneNumber(agentId, assignment);
  const assignedPhoneNumbers = await client.listAgentPhoneNumbers(agentId);
  return { phoneNumberId, assignedPhoneNumbers };
}

export async function unassignPhoneNumber(
  client: OrbitaliClient,
  agentId: string,
  phoneNumberId: string
): Promise<{ phoneNumberId: string; assignedPhoneNumbers: AgentAssignedPhoneNumber[] }> {
  const removed = await client.unassignPhoneNumber(agentId, phoneNumberId);
  const assignedPhoneNumbers = await client.listAgentPhoneNumbers(agentId);
  return { phoneNumberId: removed.phoneNumberId, assignedPhoneNumbers };
}

export function listCalls(client: OrbitaliClient, input: ListCallsInput): Promise<CallSummary[]> {
  return client.listCalls(input);
}

export function getCall(client: OrbitaliClient, callId: string): Promise<CallDetail> {
  return client.getCall(callId);
}

export function listAgentLogs(client: OrbitaliClient, input: ListAgentLogsInput): Promise<AgentLogsResponse> {
  const { agentId, ...params } = input;
  return client.listAgentLogs(agentId, params);
}

function isSameAgent(agent: Agent, request: CreateAgentRequest): boolean {
  return (
    agent.name === request.name &&
    agent.agentType === request.agentType &&
    agent.language === request.language &&
    agent.voiceName === request.voiceName &&
    agent.serverUrl === request.serverUrl
  );
}

function toolFailure(name: string, error: unknown): ToolFailure {
  if (error instanceof OrbitaliApiError) {
    return {
      name,
      error: error.message,
      status: error.status,
      code: error.code
    };
  }

  return {
    name,
    error: error instanceof Error ? error.message : String(error)
  };
}
