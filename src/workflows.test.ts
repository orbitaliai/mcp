import { describe, expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { OrbitaliApiError, type CreatedKnowledgeDocumentResponse, type OrbitaliClient, type RealtimeSessionResponse } from "./client";
import type { EnsureAgentToolsInput, GetOrCreateAgentInput, PatchAgentInput } from "./schemas";
import type {
  Agent,
  AgentAssignedPhoneNumber,
  AgentTool,
  AgentToolInput,
  CreateKnowledgeDocumentRequest,
  KnowledgeDocument
} from "./types";
import {
  assignPhoneNumber,
  createRealtimeSession,
  deleteAgentTool,
  deleteKnowledgeDocument,
  ensureAgentTools,
  getOrCreateAgent,
  listKnowledgeDocuments,
  patchAgent,
  unassignPhoneNumber,
  updateAgentTool,
  uploadKnowledgeDocument
} from "./workflows";

function makeAgent(overrides: Partial<Agent> = {}): Agent {
  return {
    id: "agent-1",
    name: "Support",
    status: "active",
    agentType: "webhook",
    language: "en-US",
    voiceName: "aura-orion",
    serverUrl: "https://hooks.example.com",
    serverHeaders: {},
    serverSecret: null,
    handoffPhoneNumber: null,
    phoneNumber: null,
    toolCount: 0,
    knowledgeDocumentCount: 0,
    callsToday: 0,
    successRate: 0,
    backgroundSound: "none",
    updatedAt: "2026-07-02T00:00:00.000Z",
    ...overrides
  };
}

function makeTool(overrides: Partial<AgentTool> = {}): AgentTool {
  return {
    id: "tool-1",
    name: "check_availability",
    description: "Check availability",
    parameterSchema: {},
    responseSchema: null,
    timeoutMs: 5000,
    onError: "return_error",
    enabled: true,
    toolUrl: null,
    toolMethod: "POST",
    toolHeaders: {},
    toolStaticParams: {},
    toolContentType: "application/json",
    toolRuntimeMetadata: [],
    ...overrides
  };
}

function makeKnowledgeDocument(overrides: Partial<KnowledgeDocument> = {}): KnowledgeDocument {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    name: "Refund policy",
    description: null,
    type: "markdown",
    sizeBytes: 128,
    status: "ready",
    error: null,
    chunkCount: 1,
    createdAt: "2026-07-02T00:00:00.000Z",
    ...overrides
  };
}

function createAgentInput(overrides: Partial<GetOrCreateAgentInput> = {}): GetOrCreateAgentInput {
  return {
    name: "Support",
    agentType: "webhook",
    language: "en-US",
    voiceName: "aura-orion",
    serverUrl: "https://hooks.example.com",
    serverHeaders: {},
    serverSecret: null,
    handoffPhoneNumber: null,
    phoneNumberAssignments: [],
    backgroundSound: "none",
    promptType: "static",
    identity: "You are a support agent.",
    instructions: "Help the caller.",
    greetingType: "none",
    staticGreeting: null,
    outboundGreeting: null,
    reuseExisting: true,
    ...overrides
  } as GetOrCreateAgentInput;
}

interface StubCalls {
  createAgent: unknown[];
  createAgentTool: Array<{ agentId: string; name: string }>;
  updateAgentTool: Array<{ agentId: string; toolId: string; name: string }>;
  deleteAgentTool: Array<{ agentId: string; toolId: string }>;
  deleteKnowledgeDocument: Array<{ agentId: string; documentId: string }>;
  uploadKnowledgeFile: Array<{ agentId: string; fileName: string; name?: string; description?: string | null; text: string }>;
  uploadKnowledgeText: Array<{ agentId: string; body: CreateKnowledgeDocumentRequest }>;
  patchAgent: Array<{ agentId: string; body: unknown }>;
  listAgentsCount: number;
}

function stubClient(
  handlers: Partial<{
    listAgents: () => Promise<Agent[]>;
    listAgentTools: (agentId: string) => Promise<AgentTool[]>;
    createAgent: (body: unknown) => Promise<{ id: string }>;
    patchAgent: (agentId: string, body: unknown) => Promise<{ id: string }>;
    createAgentTool: (agentId: string, body: { name: string }) => Promise<{ id: string }>;
    updateAgentTool: (agentId: string, toolId: string, body: AgentToolInput) => Promise<{ id: string }>;
    deleteAgentTool: (agentId: string, toolId: string) => Promise<{ id: string }>;
    listKnowledgeDocuments: (agentId: string) => Promise<KnowledgeDocument[]>;
    uploadKnowledgeText: (agentId: string, body: CreateKnowledgeDocumentRequest) => Promise<CreatedKnowledgeDocumentResponse>;
    uploadKnowledgeFile: (
      agentId: string,
      upload: { fileName: string; file: Blob; name?: string; description?: string | null }
    ) => Promise<CreatedKnowledgeDocumentResponse>;
    deleteKnowledgeDocument: (agentId: string, documentId: string) => Promise<{ id: string }>;
    createRealtimeSession: (agentId: string) => Promise<RealtimeSessionResponse>;
  }>
): { client: OrbitaliClient; calls: StubCalls } {
  const calls: StubCalls = {
    createAgent: [],
    createAgentTool: [],
    updateAgentTool: [],
    deleteAgentTool: [],
    deleteKnowledgeDocument: [],
    uploadKnowledgeFile: [],
    uploadKnowledgeText: [],
    patchAgent: [],
    listAgentsCount: 0
  };

  const client = {
    listAgents: async () => {
      calls.listAgentsCount += 1;
      return handlers.listAgents ? handlers.listAgents() : [];
    },
    listAgentTools: async (agentId: string) => (handlers.listAgentTools ? handlers.listAgentTools(agentId) : []),
    createAgent: async (body: unknown) => {
      calls.createAgent.push(body);
      return handlers.createAgent ? handlers.createAgent(body) : { id: "created-agent" };
    },
    patchAgent: async (agentId: string, body: unknown) => {
      calls.patchAgent.push({ agentId, body });
      return handlers.patchAgent ? handlers.patchAgent(agentId, body) : { id: agentId };
    },
    createAgentTool: async (agentId: string, body: { name: string }) => {
      calls.createAgentTool.push({ agentId, name: body.name });
      return handlers.createAgentTool ? handlers.createAgentTool(agentId, body) : { id: `created-${body.name}` };
    },
    updateAgentTool: async (agentId: string, toolId: string, body: AgentToolInput) => {
      calls.updateAgentTool.push({ agentId, toolId, name: body.name });
      return handlers.updateAgentTool ? handlers.updateAgentTool(agentId, toolId, body) : { id: toolId };
    },
    deleteAgentTool: async (agentId: string, toolId: string) => {
      calls.deleteAgentTool.push({ agentId, toolId });
      return handlers.deleteAgentTool ? handlers.deleteAgentTool(agentId, toolId) : { id: toolId };
    },
    listKnowledgeDocuments: async (agentId: string) =>
      handlers.listKnowledgeDocuments ? handlers.listKnowledgeDocuments(agentId) : [],
    uploadKnowledgeText: async (agentId: string, body: CreateKnowledgeDocumentRequest) => {
      calls.uploadKnowledgeText.push({ agentId, body });
      return handlers.uploadKnowledgeText ? handlers.uploadKnowledgeText(agentId, body) : { id: "doc-1", name: "Doc", description: null };
    },
    uploadKnowledgeFile: async (
      agentId: string,
      upload: { fileName: string; file: Blob; name?: string; description?: string | null }
    ) => {
      calls.uploadKnowledgeFile.push({
        agentId,
        fileName: upload.fileName,
        name: upload.name,
        description: upload.description,
        text: await upload.file.text()
      });
      return handlers.uploadKnowledgeFile
        ? handlers.uploadKnowledgeFile(agentId, upload)
        : { id: "doc-1", name: upload.name ?? "Doc", description: upload.description ?? null };
    },
    deleteKnowledgeDocument: async (agentId: string, documentId: string) => {
      calls.deleteKnowledgeDocument.push({ agentId, documentId });
      return handlers.deleteKnowledgeDocument ? handlers.deleteKnowledgeDocument(agentId, documentId) : { id: documentId };
    },
    createRealtimeSession: async (agentId: string) => {
      if (!handlers.createRealtimeSession) throw new Error("not stubbed");
      return handlers.createRealtimeSession(agentId);
    }
  } as unknown as OrbitaliClient;

  return { client, calls };
}

describe("getOrCreateAgent", () => {
  test("reuses an exact match without creating", async () => {
    const existing = makeAgent({ id: "agent-42" });
    const { client, calls } = stubClient({ listAgents: async () => [makeAgent({ id: "other", name: "Sales" }), existing] });

    const result = await getOrCreateAgent(client, createAgentInput());

    expect(result).toEqual({ agentId: "agent-42", created: false, matchedAgent: existing });
    expect(calls.createAgent).toHaveLength(0);
  });

  test("creates a new agent when nothing matches", async () => {
    const { client, calls } = stubClient({
      listAgents: async () => [makeAgent({ id: "other", voiceName: "different-voice" })],
      createAgent: async () => ({ id: "new-agent" })
    });

    const result = await getOrCreateAgent(client, createAgentInput());

    expect(result).toEqual({ agentId: "new-agent", created: true });
    expect(calls.createAgent).toHaveLength(1);
    expect((calls.createAgent[0] as { reuseExisting?: boolean }).reuseExisting).toBeUndefined();
  });

  test("skips listing and always creates when reuseExisting is false", async () => {
    const { client, calls } = stubClient({
      listAgents: async () => [makeAgent()],
      createAgent: async () => ({ id: "forced-agent" })
    });

    const result = await getOrCreateAgent(client, createAgentInput({ reuseExisting: false }));

    expect(result).toEqual({ agentId: "forced-agent", created: true });
    expect(calls.listAgentsCount).toBe(0);
  });
});

describe("patchAgent", () => {
  const input: PatchAgentInput = {
    agentId: "11111111-1111-4111-8111-111111111111",
    expectedUpdatedAt: "2026-07-02T00:00:00.000Z",
    serverUrl: "https://hooks.example.com/new"
  };

  test("patches an agent and forwards only patch fields", async () => {
    const { client, calls } = stubClient({
      patchAgent: async () => ({ id: input.agentId })
    });

    const result = await patchAgent(client, input);

    expect(result).toEqual({ id: input.agentId });
    expect(calls.patchAgent).toEqual([
      {
        agentId: input.agentId,
        body: {
          expectedUpdatedAt: input.expectedUpdatedAt,
          serverUrl: input.serverUrl
        }
      }
    ]);
  });

  test("surfaces optimistic concurrency conflicts", async () => {
    const { client } = stubClient({
      patchAgent: async () => {
        throw new OrbitaliApiError("Agent update conflict", { status: 409 });
      }
    });

    await expect(patchAgent(client, input)).rejects.toMatchObject({
      message: "Agent update conflict",
      status: 409
    });
  });
});

describe("ensureAgentTools", () => {
  test("skips existing names and creates only missing tools", async () => {
    const existing = makeTool({ id: "existing-id", name: "check_availability" });
    const { client, calls } = stubClient({
      listAgentTools: async () => [existing],
      createAgentTool: async (_agentId, body) => ({ id: `new-${body.name}` })
    });

    const input: EnsureAgentToolsInput = {
      agentId: "agent-1",
      tools: [
        makeTool({ name: "check_availability" }),
        makeTool({ name: "create_booking" })
      ]
    };

    const result = await ensureAgentTools(client, input);

    expect(result).toEqual({
      existing: [{ name: "check_availability", id: "existing-id" }],
      created: [{ name: "create_booking", id: "new-create_booking" }],
      updated: [],
      failed: []
    });
    expect(calls.createAgentTool).toEqual([{ agentId: "agent-1", name: "create_booking" }]);
  });

  test("does not create duplicate names submitted in the same request", async () => {
    const { client, calls } = stubClient({
      listAgentTools: async () => [],
      createAgentTool: async (_agentId, body) => ({ id: `new-${body.name}` })
    });

    const input: EnsureAgentToolsInput = {
      agentId: "agent-1",
      tools: [
        makeTool({ name: "create_booking" }),
        makeTool({ name: "create_booking" })
      ]
    };

    const result = await ensureAgentTools(client, input);

    expect(result).toEqual({
      created: [{ name: "create_booking", id: "new-create_booking" }],
      existing: [{ name: "create_booking", id: "new-create_booking" }],
      updated: [],
      failed: []
    });
    expect(calls.createAgentTool).toEqual([{ agentId: "agent-1", name: "create_booking" }]);
  });

  test("preserves successes and reports per-tool create failures", async () => {
    const { client, calls } = stubClient({
      listAgentTools: async () => [],
      createAgentTool: async (_agentId, body) => {
        if (body.name === "broken_tool") {
          throw new OrbitaliApiError("Invalid request body", { status: 400, code: "BAD_TOOL" });
        }
        if (body.name === "timeout_tool") {
          throw new OrbitaliApiError("Request timed out", { status: 0, code: "REQUEST_TIMEOUT" });
        }
        return { id: `new-${body.name}` };
      }
    });

    const input: EnsureAgentToolsInput = {
      agentId: "agent-1",
      tools: [
        makeTool({ name: "create_booking" }),
        makeTool({ name: "broken_tool" }),
        makeTool({ name: "timeout_tool" }),
        makeTool({ name: "cancel_booking" })
      ]
    };

    const result = await ensureAgentTools(client, input);

    expect(result).toEqual({
      created: [
        { name: "create_booking", id: "new-create_booking" },
        { name: "cancel_booking", id: "new-cancel_booking" }
      ],
      existing: [],
      updated: [],
      failed: [
        { name: "broken_tool", error: "Invalid request body", status: 400, code: "BAD_TOOL" },
        { name: "timeout_tool", error: "Request timed out", status: 0, code: "REQUEST_TIMEOUT" }
      ]
    });
    expect(calls.createAgentTool).toEqual([
      { agentId: "agent-1", name: "create_booking" },
      { agentId: "agent-1", name: "broken_tool" },
      { agentId: "agent-1", name: "timeout_tool" },
      { agentId: "agent-1", name: "cancel_booking" }
    ]);
  });

  test("updates existing tools when requested", async () => {
    const existing = makeTool({ id: "existing-id", name: "check_availability" });
    const { client, calls } = stubClient({
      listAgentTools: async () => [existing],
      createAgentTool: async (_agentId, body) => ({ id: `new-${body.name}` })
    });

    const input: EnsureAgentToolsInput = {
      agentId: "agent-1",
      updateExisting: true,
      tools: [
        makeTool({ name: "check_availability", description: "Updated availability check" }),
        makeTool({ name: "create_booking" })
      ]
    };

    const result = await ensureAgentTools(client, input);

    expect(result).toEqual({
      existing: [],
      created: [{ name: "create_booking", id: "new-create_booking" }],
      updated: [{ name: "check_availability", id: "existing-id" }],
      failed: []
    });
    expect(calls.updateAgentTool).toEqual([{ agentId: "agent-1", toolId: "existing-id", name: "check_availability" }]);
    expect(calls.createAgentTool).toEqual([{ agentId: "agent-1", name: "create_booking" }]);
  });

  test("reports per-tool update failures", async () => {
    const existing = makeTool({ id: "existing-id", name: "broken_tool" });
    const { client } = stubClient({
      listAgentTools: async () => [existing],
      updateAgentTool: async () => {
        throw new OrbitaliApiError("Tool not found", { status: 404 });
      }
    });

    const result = await ensureAgentTools(client, {
      agentId: "agent-1",
      updateExisting: true,
      tools: [makeTool({ name: "broken_tool" })]
    });

    expect(result).toEqual({
      created: [],
      existing: [],
      updated: [],
      failed: [{ name: "broken_tool", error: "Tool not found", status: 404, code: undefined }]
    });
  });
});

describe("agent tools", () => {
  test("updates a tool and strips routing fields from the body", async () => {
    const { client, calls } = stubClient({});
    const input = {
      agentId: "11111111-1111-4111-8111-111111111111",
      toolId: "22222222-2222-4222-8222-222222222222",
      ...makeTool({ id: "ignored-id", name: "check_availability" })
    };

    const result = await updateAgentTool(client, input);

    expect(result).toEqual({ id: input.toolId });
    expect(calls.updateAgentTool).toEqual([
      {
        agentId: input.agentId,
        toolId: input.toolId,
        name: "check_availability"
      }
    ]);
  });

  test("deletes a tool", async () => {
    const { client, calls } = stubClient({});

    const result = await deleteAgentTool(
      client,
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222"
    );

    expect(result).toEqual({ id: "22222222-2222-4222-8222-222222222222" });
    expect(calls.deleteAgentTool).toEqual([
      {
        agentId: "11111111-1111-4111-8111-111111111111",
        toolId: "22222222-2222-4222-8222-222222222222"
      }
    ]);
  });
});

describe("knowledge documents", () => {
  test("lists knowledge documents", async () => {
    const documents = [makeKnowledgeDocument()];
    const { client } = stubClient({ listKnowledgeDocuments: async () => documents });

    const result = await listKnowledgeDocuments(client, "agent-1");

    expect(result).toBe(documents);
  });

  test("uploads generated document content as JSON", async () => {
    const { client, calls } = stubClient({
      uploadKnowledgeText: async () => ({ id: "doc-1", name: "Refund policy", description: null })
    });

    const result = await uploadKnowledgeDocument(client, {
      agentId: "11111111-1111-4111-8111-111111111111",
      name: "Refund policy",
      content: "# Refund policy"
    });

    expect(result).toEqual({ id: "doc-1", name: "Refund policy", description: null });
    expect(calls.uploadKnowledgeText).toEqual([
      {
        agentId: "11111111-1111-4111-8111-111111111111",
        body: { name: "Refund policy", content: "# Refund policy" }
      }
    ]);
    expect(calls.uploadKnowledgeFile).toHaveLength(0);
  });

  test("uploads a local file as multipart data", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbitali-mcp-"));
    const filePath = join(dir, "refund-policy.md");
    await writeFile(filePath, "# Refund policy");

    try {
      const { client, calls } = stubClient({
        uploadKnowledgeFile: async () => ({ id: "doc-1", name: "Refund policy", description: "Refund details" })
      });

      const result = await uploadKnowledgeDocument(client, {
        agentId: "11111111-1111-4111-8111-111111111111",
        filePath,
        name: "Refund policy",
        description: "Refund details"
      });

      expect(result).toEqual({ id: "doc-1", name: "Refund policy", description: "Refund details" });
      expect(calls.uploadKnowledgeFile).toEqual([
        {
          agentId: "11111111-1111-4111-8111-111111111111",
          fileName: "refund-policy.md",
          name: "Refund policy",
          description: "Refund details",
          text: "# Refund policy"
        }
      ]);
      expect(calls.uploadKnowledgeText).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("rejects oversized local files before upload", async () => {
    const dir = await mkdtemp(join(tmpdir(), "orbitali-mcp-"));
    const filePath = join(dir, "large-policy.md");
    await writeFile(filePath, "x".repeat(1_000_001));

    try {
      const { client, calls } = stubClient({});

      await expect(
        uploadKnowledgeDocument(client, {
          agentId: "11111111-1111-4111-8111-111111111111",
          filePath
        })
      ).rejects.toThrow("Knowledge file exceeds 1000000 bytes");

      expect(calls.uploadKnowledgeFile).toHaveLength(0);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  test("deletes a knowledge document", async () => {
    const { client, calls } = stubClient({});

    const result = await deleteKnowledgeDocument(client, "agent-1", "doc-1");

    expect(result).toEqual({ id: "doc-1" });
    expect(calls.deleteKnowledgeDocument).toEqual([{ agentId: "agent-1", documentId: "doc-1" }]);
  });
});

describe("createRealtimeSession", () => {
  test("forwards the API response unchanged", async () => {
    const response: RealtimeSessionResponse = {
      token: "tok",
      expiresAt: "2026-07-02T00:01:00.000Z",
      websocketUrl: "wss://agent.example.com/ws/agents/agent-1?token=tok",
      protocol: {
        inputAudio: { encoding: "pcm16", sampleRate: 16000 },
        outputAudio: { encoding: "pcm16", sampleRate: 24000 }
      }
    };
    const { client } = stubClient({ createRealtimeSession: async () => response });

    const result = await createRealtimeSession(client, "agent-1");

    expect(result).toBe(response);
  });
});

const assignedNumber: AgentAssignedPhoneNumber = {
  phoneNumberId: "22222222-2222-4222-8222-222222222222",
  phoneNumber: "+15550001000",
  friendlyName: "+15550001000",
  handoffPhoneNumber: null
};

describe("assignPhoneNumber", () => {
  test("assigns and returns the agent's resulting assignments", async () => {
    const assignCalls: Array<{ agentId: string; assignment: unknown }> = [];
    const client = {
      assignPhoneNumber: async (agentId: string, assignment: unknown) => {
        assignCalls.push({ agentId, assignment });
        return { phoneNumberId: assignedNumber.phoneNumberId };
      },
      listAgentPhoneNumbers: async () => [assignedNumber]
    } as unknown as OrbitaliClient;

    const result = await assignPhoneNumber(client, {
      agentId: "11111111-1111-4111-8111-111111111111",
      phoneNumberId: assignedNumber.phoneNumberId,
      handoffPhoneNumber: "+15550009999"
    });

    expect(result).toEqual({
      phoneNumberId: assignedNumber.phoneNumberId,
      assignedPhoneNumbers: [assignedNumber]
    });
    expect(assignCalls).toEqual([
      {
        agentId: "11111111-1111-4111-8111-111111111111",
        assignment: { phoneNumberId: assignedNumber.phoneNumberId, handoffPhoneNumber: "+15550009999" }
      }
    ]);
  });
});

describe("unassignPhoneNumber", () => {
  test("unassigns and returns the agent's remaining assignments", async () => {
    const client = {
      unassignPhoneNumber: async (_agentId: string, phoneNumberId: string) => ({ phoneNumberId }),
      listAgentPhoneNumbers: async () => []
    } as unknown as OrbitaliClient;

    const result = await unassignPhoneNumber(
      client,
      "11111111-1111-4111-8111-111111111111",
      assignedNumber.phoneNumberId
    );

    expect(result).toEqual({ phoneNumberId: assignedNumber.phoneNumberId, assignedPhoneNumbers: [] });
  });
});
