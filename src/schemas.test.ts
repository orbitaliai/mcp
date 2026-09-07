import { describe, expect, test } from "bun:test";
import { getOrCreateAgentInputSchema, uploadKnowledgeDocumentInputSchema } from "./schemas";
import { agentMcpToolSelectionSchema, agentToolInputSchema, mcpIntegrationSchema } from "./types";

const agentId = "11111111-1111-4111-8111-111111111111";

describe("getOrCreateAgentInputSchema", () => {
  test("requires an explicit agent type", () => {
    const result = getOrCreateAgentInputSchema.safeParse({
      name: "Receptionist",
      language: "en-US",
      voiceName: "eve",
      serverUrl: null,
      serverHeaders: {},
      serverSecret: null,
      handoffPhoneNumber: null,
      promptType: "static",
      identity: "You are a receptionist.",
      instructions: "Help callers.",
      greetingType: "static",
      staticGreeting: "How can I help?",
      outboundGreeting: null
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["agentType"]
        })
      );
    }
  });

  for (const agentType of ["static", "http", "webhook"] as const) {
    test(`accepts the ${agentType} agent type`, () => {
      expect(getOrCreateAgentInputSchema.safeParse(validAgentInput(agentType)).success).toBe(true);
    });
  }

  test("rejects agent type values with invalid casing", () => {
    const result = getOrCreateAgentInputSchema.safeParse(validAgentInput("HTTP"));

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toContainEqual(
        expect.objectContaining({
          path: ["agentType"]
        })
      );
    }
  });

  test("keeps ambient and tool-calling sounds independent", () => {
    const parsed = getOrCreateAgentInputSchema.parse({
      ...validAgentInput("static"),
      backgroundSound: "keyboard",
      ambientSound: "office1"
    });

    expect(parsed.backgroundSound).toBe("keyboard");
    expect(parsed.ambientSound).toBe("office1");
  });
});

describe("agentToolInputSchema", () => {
  const toolUrlSchema = agentToolInputSchema.shape.toolUrl;

  test("accepts only HTTPS tool URLs", () => {
    expect(toolUrlSchema.safeParse("https://example.com/tool").success).toBe(true);
    expect(toolUrlSchema.safeParse("http://example.com/tool").success).toBe(false);
    expect(toolUrlSchema.safeParse("mailto:tools@example.com").success).toBe(false);
  });

  test("preserves tool URL trimming, nullability, and default behavior", () => {
    expect(toolUrlSchema.parse(" https://example.com/tool ")).toBe("https://example.com/tool");
    expect(toolUrlSchema.parse(null)).toBeNull();
    expect(toolUrlSchema.parse(undefined)).toBeNull();
  });
});

describe("connected MCP schemas", () => {
  test("rejects blank tool names and trims valid names", () => {
    const selection = {
      mcpServerId: "22222222-2222-4222-8222-222222222222",
      enabled: true
    };

    expect(agentMcpToolSelectionSchema.safeParse({ ...selection, toolName: "   " }).success).toBe(false);
    expect(agentMcpToolSelectionSchema.parse({ ...selection, toolName: " book_appointment " }).toolName).toBe(
      "book_appointment"
    );
  });

  test("types cached tool names while preserving provider metadata", () => {
    const parsed = mcpIntegrationSchema.parse({
      id: "11111111-1111-4111-8111-111111111111",
      organizationId: "22222222-2222-4222-8222-222222222222",
      name: "Calendly",
      url: "https://mcp.calendly.example.com",
      status: "active",
      authType: "oauth2",
      cachedTools: [{ name: "find_available_times", description: "Find slots", providerMetadata: { version: 1 } }],
      cachedToolsAt: "2026-07-22T00:00:00.000Z",
      createdAt: "2026-07-22T00:00:00.000Z",
      updatedAt: "2026-07-22T00:00:00.000Z"
    });

    expect(parsed.cachedTools[0]).toEqual({
      name: "find_available_times",
      description: "Find slots",
      providerMetadata: { version: 1 }
    });
  });
});

function validAgentInput(agentType: unknown): Record<string, unknown> {
  return {
    name: "Receptionist",
    agentType,
    language: "en-US",
    voiceName: "eve",
    serverUrl: null,
    serverHeaders: {},
    serverSecret: null,
    handoffPhoneNumber: null,
    promptType: "static",
    identity: "You are a receptionist.",
    instructions: "Help callers.",
    greetingType: "static",
    staticGreeting: "How can I help?",
    outboundGreeting: null
  };
}

describe("uploadKnowledgeDocumentInputSchema", () => {
  test("rejects unsupported file extensions", () => {
    const result = uploadKnowledgeDocumentInputSchema.safeParse({
      agentId,
      filePath: "/tmp/refund-policy.docx"
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ["filePath"],
          message: "Knowledge file must be a .txt, .md, or .pdf file"
        })
      ]);
    }
  });

  test("rejects inputs with both content and filePath", () => {
    const result = uploadKnowledgeDocumentInputSchema.safeParse({
      agentId,
      content: "# Refund policy",
      filePath: "/tmp/refund-policy.md"
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ["filePath"],
          message: "Provide either content or filePath, not both"
        })
      ]);
    }
  });

  test("rejects inputs with neither content nor filePath", () => {
    const result = uploadKnowledgeDocumentInputSchema.safeParse({
      agentId,
      name: "Refund policy"
    });

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error.issues).toEqual([
        expect.objectContaining({
          path: ["content"],
          message: "Provide content or filePath"
        })
      ]);
    }
  });
});
