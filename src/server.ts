import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import packageJson from "../package.json";
import type { OrbitaliClient } from "./client";
import { OrbitaliApiError } from "./client";
import {
  createRealtimeSessionInputSchema,
  deleteAgentToolInputSchema,
  deleteKnowledgeDocumentInputSchema,
  ensureAgentToolsInputSchema,
  getOrCreateAgentInputSchema,
  listKnowledgeDocumentsInputSchema,
  listAgentToolsInputSchema,
  patchAgentInputSchema,
  updateAgentToolInputSchema,
  uploadKnowledgeDocumentInputSchema,
  duplicateToolNameMessages
} from "./schemas";
import {
  createRealtimeSession,
  deleteAgentTool,
  deleteKnowledgeDocument,
  ensureAgentTools,
  getOrCreateAgent,
  listKnowledgeDocuments,
  listAgentTools,
  listAgents,
  patchAgent,
  updateAgentTool,
  uploadKnowledgeDocument
} from "./workflows";

export const SERVER_NAME = "orbitali";
export const SERVER_VERSION = packageJson.version;

export function createServer(client: OrbitaliClient): McpServer {
  const server = new McpServer({ name: SERVER_NAME, version: SERVER_VERSION });

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
        "Create a voice agent, or reuse an existing one that matches name, agentType, language, voiceName, and serverUrl. Set reuseExisting to false to always create.",
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
        "Create the provided tools on an agent, skipping matching names by default or replacing them when updateExisting is true.",
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
