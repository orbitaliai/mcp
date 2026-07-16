import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import packageJson from "../package.json";
import type { OrbitaliClient } from "./client";
import { OrbitaliApiError } from "./client";
import { SERVER_INSTRUCTIONS } from "./instructions";
import {
  assignPhoneNumberInputSchema,
  createRealtimeSessionInputSchema,
  deleteAgentToolInputSchema,
  deleteKnowledgeDocumentInputSchema,
  ensureAgentToolsInputSchema,
  getCallInputSchema,
  getOrCreateAgentInputSchema,
  listAgentLogsInputSchema,
  listCallsInputSchema,
  listKnowledgeDocumentsInputSchema,
  listAgentToolsInputSchema,
  patchAgentInputSchema,
  unassignPhoneNumberInputSchema,
  updateAgentToolInputSchema,
  uploadKnowledgeDocumentInputSchema,
  duplicateToolNameMessages
} from "./schemas";
import {
  assignPhoneNumber,
  createRealtimeSession,
  deleteAgentTool,
  deleteKnowledgeDocument,
  ensureAgentTools,
  getCall,
  getOrCreateAgent,
  listAgentLogs,
  listCalls,
  listKnowledgeDocuments,
  listAgentTools,
  listAgents,
  listPhoneNumbers,
  patchAgent,
  unassignPhoneNumber,
  updateAgentTool,
  uploadKnowledgeDocument
} from "./workflows";

export const SERVER_NAME = "orbitali";
export const SERVER_VERSION = packageJson.version;

export function createServer(client: OrbitaliClient): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION }, { instructions: SERVER_INSTRUCTIONS });

  server.registerTool(
    "list_agents",
    {
      title: "List agents",
      description: "List the voice agents in the authenticated Orbitali organization."
    },
    () => runTool(() => listAgents(client))
  );

  server.registerTool(
    "list_agent_tools",
    {
      title: "List agent tools",
      description: "List the custom tools configured on a specific agent.",
      inputSchema: listAgentToolsInputSchema
    },
    ({ agentId }) => runTool(() => listAgentTools(client, agentId))
  );

  server.registerTool(
    "get_or_create_agent",
    {
      title: "Get or create agent",
      description:
        "Create a voice agent, or reuse an existing one that matches name, agentType, language, voiceName, and serverUrl. Select agentType from the application architecture: static for no-code fixed behavior without custom tools, http for independent per-tool HTTP endpoints, or webhook for one event endpoint and optional dynamic prompts. Set reuseExisting to false to always create.",
      inputSchema: getOrCreateAgentInputSchema
    },
    (input) => runTool(() => getOrCreateAgent(client, input))
  );

  server.registerTool(
    "patch_agent",
    {
      title: "Patch agent",
      description:
        "Update fields on an existing agent. Requires expectedUpdatedAt for optimistic concurrency; a conflict is returned when the agent changed since then.",
      inputSchema: patchAgentInputSchema
    },
    (input) => runTool(() => patchAgent(client, input))
  );

  server.registerTool(
    "ensure_agent_tools",
    {
      title: "Ensure agent tools",
      description:
        "Create the provided tools on an HTTP or webhook agent, skipping matching names by default or replacing them when updateExisting is true. HTTP tools require their own toolUrl; webhook tools use the agent's serverUrl. Static agents do not support custom tools.",
      inputSchema: ensureAgentToolsInputSchema
    },
    (input) => runTool(async () => {
      const duplicateMessages = duplicateToolNameMessages(input.tools);
      if (duplicateMessages.length > 0) {
        return {
          created: [],
          existing: [],
          updated: [],
          failed: duplicateMessages.map((error) => ({ name: "input", error }))
        };
      }
      return ensureAgentTools(client, input);
    })
  );

  server.registerTool(
    "update_agent_tool",
    {
      title: "Update agent tool",
      description: "Replace one existing custom tool definition on a specific agent.",
      inputSchema: updateAgentToolInputSchema
    },
    (input) => runTool(() => updateAgentTool(client, input))
  );

  server.registerTool(
    "delete_agent_tool",
    {
      title: "Delete agent tool",
      description: "Delete one custom tool from a specific agent.",
      inputSchema: deleteAgentToolInputSchema
    },
    ({ agentId, toolId }) => runTool(() => deleteAgentTool(client, agentId, toolId))
  );

  server.registerTool(
    "list_knowledge_documents",
    {
      title: "List knowledge documents",
      description: "List the knowledge documents configured on a specific agent.",
      inputSchema: listKnowledgeDocumentsInputSchema
    },
    ({ agentId }) => runTool(() => listKnowledgeDocuments(client, agentId))
  );

  server.registerTool(
    "upload_knowledge_document",
    {
      title: "Upload knowledge document",
      description:
        "Upload document text or a local .txt, .md, or .pdf file to an agent's knowledge base for native search_knowledge retrieval.",
      inputSchema: uploadKnowledgeDocumentInputSchema
    },
    (input) => runTool(() => uploadKnowledgeDocument(client, input))
  );

  server.registerTool(
    "delete_knowledge_document",
    {
      title: "Delete knowledge document",
      description: "Delete a knowledge document from a specific agent.",
      inputSchema: deleteKnowledgeDocumentInputSchema
    },
    ({ agentId, documentId }) => runTool(() => deleteKnowledgeDocument(client, agentId, documentId))
  );

  server.registerTool(
    "create_realtime_session",
    {
      title: "Create realtime session",
      description: "Create a short-lived realtime session (token, expiration, WebSocket URL, and audio protocol) for an active agent.",
      inputSchema: createRealtimeSessionInputSchema
    },
    ({ agentId }) => runTool(() => createRealtimeSession(client, agentId))
  );

  server.registerTool(
    "list_phone_numbers",
    {
      title: "List phone numbers",
      description:
        "List the organization's phone numbers with claim status and current agent assignment. Numbers without assignedAgentId are available to assign."
    },
    () => runTool(() => listPhoneNumbers(client))
  );

  server.registerTool(
    "assign_phone_number",
    {
      title: "Assign phone number",
      description:
        "Assign a claimed phone number to an agent so it answers calls on that number. Moves the number if it is currently assigned to another agent. Returns the agent's resulting assignments.",
      inputSchema: assignPhoneNumberInputSchema
    },
    (input) => runTool(() => assignPhoneNumber(client, input))
  );

  server.registerTool(
    "unassign_phone_number",
    {
      title: "Unassign phone number",
      description: "Remove a phone number assignment from an agent. The number stays claimed by the organization.",
      inputSchema: unassignPhoneNumberInputSchema
    },
    ({ agentId, phoneNumberId }) => runTool(() => unassignPhoneNumber(client, agentId, phoneNumberId))
  );

  server.registerTool(
    "list_calls",
    {
      title: "List calls",
      description: "List recent call history (status, duration, numbers, tool invocation count), optionally filtered by agent.",
      inputSchema: listCallsInputSchema
    },
    (input) => runTool(() => listCalls(client, input))
  );

  server.registerTool(
    "get_call",
    {
      title: "Get call detail",
      description: "Get one call with its summary, full transcript messages, tool invocations, and LLM usage.",
      inputSchema: getCallInputSchema
    },
    ({ callId }) => runTool(() => getCall(client, callId))
  );

  server.registerTool(
    "list_agent_logs",
    {
      title: "List agent logs",
      description:
        "List runtime logs for an agent from the last 24 hours, filterable by severity and session id, with limit/offset pagination.",
      inputSchema: listAgentLogsInputSchema
    },
    (input) => runTool(() => listAgentLogs(client, input))
  );

  return server;
}

/** Runs a workflow handler and maps its result (or error) into a tool result. */
async function runTool(handler: () => Promise<unknown>): Promise<CallToolResult> {
  try {
    const data = await handler();
    return toToolResult(data);
  } catch (error) {
    return toErrorResult(error);
  }
}

function toToolResult(data: unknown): CallToolResult {
  const result: CallToolResult = {
    content: [{ type: "text", text: JSON.stringify(data ?? null, null, 2) }]
  };

  if (data && typeof data === "object" && !Array.isArray(data)) {
    result.structuredContent = data as Record<string, unknown>;
  }

  return result;
}

function toErrorResult(error: unknown): CallToolResult {
  if (error instanceof OrbitaliApiError) {
    const payload = {
      error: error.message,
      status: error.status,
      code: error.code,
      issues: error.issues,
      details: error.details
    };
    const compactPayload = Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined));
    return {
      content: [{ type: "text", text: JSON.stringify(compactPayload, null, 2) }],
      structuredContent: compactPayload,
      isError: true
    };
  }

  const message = error instanceof Error ? error.message : String(error);
  return {
    content: [{ type: "text", text: `Unexpected error: ${message}` }],
    isError: true
  };
}
