import { describe, expect, test } from "bun:test";
import { OrbitaliApiError, type OrbitaliClient, type RealtimeSessionResponse } from "./client";
import type { EnsureAgentToolsInput, GetOrCreateAgentInput, PatchAgentInput } from "./schemas";
import type { Agent, AgentTool } from "./types";
import { createRealtimeSession, ensureAgentTools, getOrCreateAgent, patchAgent } from "./workflows";

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
    createRealtimeSession: (agentId: string) => Promise<RealtimeSessionResponse>;
  }>
): { client: OrbitaliClient; calls: StubCalls } {
  const calls: StubCalls = { createAgent: [], createAgentTool: [], patchAgent: [], listAgentsCount: 0 };

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
