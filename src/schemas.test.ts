import { describe, expect, test } from "bun:test";
import { getOrCreateAgentInputSchema, uploadKnowledgeDocumentInputSchema } from "./schemas";
import { agentToolInputSchema } from "./types";

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
