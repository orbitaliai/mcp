import { describe, expect, test } from "bun:test";
import { getOrCreateAgentInputSchema, uploadKnowledgeDocumentInputSchema } from "./schemas";
import { agentMcpToolSelectionSchema, agentToolInputSchema, callSummarySchema, mcpIntegrationSchema } from "./types";

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

describe("call usage schema", () => {
  const base = {
    id: "33333333-3333-4333-8333-333333333333",
    agentName: "Receptionist",
    fromNumber: "+15550001000",
    toNumber: "+15550002000",
    status: "completed",
    durationSeconds: 30,
    startedAt: "2026-08-17T10:02:00.000Z",
    toolInvocations: 0
  };

  test("rejects inconsistent allocations even when legacy cost is present", () => {
    expect(callSummarySchema.safeParse({
      ...base, usageCostEur: 0.05,
      billableMinutes: 1, includedMinutes: 1, overageMinutes: 1, usageClassification: "split"
    }).success).toBe(false);
  });

  test("accepts independently rounded allocations and floating-point sums", () => {
    for (const [billableMinutes, includedMinutes, overageMinutes] of [[0.33, 0.17, 0.17], [0.67, 0.33, 0.33], [0.3, 0.1, 0.2]]) {
      expect(callSummarySchema.safeParse({
        ...base, billableMinutes, includedMinutes, overageMinutes, usageClassification: "split"
      }).success).toBe(true);
    }
  });

  test("requires either legacy cost or complete allocation", () => {
    expect(callSummarySchema.parse({ ...base, usageCostEur: 0 }).usageCostEur).toBe(0);
    for (const usage of [{}, { billableMinutes: 1 }, { usageCostEur: 0.05, billableMinutes: 1 }]) {
      expect(callSummarySchema.safeParse({ ...base, ...usage }).success).toBe(false);
    }
  });

  test("retains nonnegative validation for every usage number", () => {
    const usage = { billableMinutes: 0, includedMinutes: 0, overageMinutes: 0, usageClassification: "included" };
    for (const field of ["billableMinutes", "includedMinutes", "overageMinutes", "usageCostEur"]) {
      expect(callSummarySchema.safeParse({ ...base, ...usage, [field]: -1 }).success).toBe(false);
    }
  });

  test("accepts allowance and overage allocation without a per-call cost", () => {
    expect(
      callSummarySchema.parse({
        id: "33333333-3333-4333-8333-333333333333",
        agentName: "Receptionist",
        fromNumber: "+15550001000",
        toNumber: "+15550002000",
        status: "completed",
        durationSeconds: 30,
        startedAt: "2026-08-17T10:02:00.000Z",
        toolInvocations: 0,
        billableMinutes: 0.5,
        includedMinutes: 0.17,
        overageMinutes: 0.33,
        usageClassification: "split"
      })
    ).toMatchObject({ usageClassification: "split", overageMinutes: 0.33 });
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
