import { describe, expect, test } from "bun:test";
import { uploadKnowledgeDocumentInputSchema } from "./schemas";

const agentId = "11111111-1111-4111-8111-111111111111";

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
