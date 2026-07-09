import { describe, expect, test } from "bun:test";
import { OrbitaliApiError, OrbitaliClient, type FetchLike } from "./client";

const config = { apiKey: "sk_test", baseUrl: "https://api.example.com" };

interface CapturedRequest {
  url: string;
  init?: RequestInit;
}

function mockFetch(body: unknown, status: number): { fetchImpl: FetchLike; calls: CapturedRequest[] } {
  const calls: CapturedRequest[] = [];
  const fetchImpl: FetchLike = async (url, init) => {
    calls.push({ url, init });
    // Build a fresh response per call so the body can be read more than once.
    return Response.json(body, { status });
  };
  return { fetchImpl, calls };
}

describe("OrbitaliClient", () => {
  test("sends bearer auth and parses success JSON", async () => {
    const { fetchImpl, calls } = mockFetch([{ id: "agent-1" }], 200);
    const client = new OrbitaliClient(config, fetchImpl);

    const agents = await client.listAgents();

    expect(agents).toEqual([{ id: "agent-1" }] as never);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.example.com/public/v1/agents");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers.Authorization).toBe("Bearer sk_test");
  });

  test("sends JSON content type and body for writes", async () => {
    const { fetchImpl, calls } = mockFetch({ id: "agent-9" }, 201);
    const client = new OrbitaliClient(config, fetchImpl);

    await client.createAgent({ name: "Support" } as never);

    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(calls[0]?.init?.method).toBe("POST");
    expect(headers["Content-Type"]).toBe("application/json");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "Support" }));
  });

  test("uploads knowledge text as JSON", async () => {
    const { fetchImpl, calls } = mockFetch({ id: "doc-1", name: "Refund policy", description: null }, 201);
    const client = new OrbitaliClient(config, fetchImpl);

    const result = await client.uploadKnowledgeText("agent-1", {
      name: "Refund policy",
      content: "# Refund policy"
    });

    expect(result).toEqual({ id: "doc-1", name: "Refund policy", description: null });
    expect(calls[0]?.url).toBe("https://api.example.com/public/v1/agents/agent-1/knowledge");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ name: "Refund policy", content: "# Refund policy" }));
  });

  test("lists knowledge documents with GET", async () => {
    const { fetchImpl, calls } = mockFetch([], 200);
    const client = new OrbitaliClient(config, fetchImpl);

    const result = await client.listKnowledgeDocuments("agent-1");

    expect(result).toEqual([]);
    expect(calls[0]?.url).toBe("https://api.example.com/public/v1/agents/agent-1/knowledge");
    expect(calls[0]?.init?.method).toBe("GET");
  });

  test("uploads knowledge files as multipart form data", async () => {
    const { fetchImpl, calls } = mockFetch({ id: "doc-1", name: "Refund policy", description: "Refund details" }, 201);
    const client = new OrbitaliClient(config, fetchImpl);

    await client.uploadKnowledgeFile("agent-1", {
      fileName: "refund-policy.md",
      file: new Blob(["# Refund policy"]),
      name: "Refund policy",
      description: "Refund details"
    });

    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBeUndefined();
    expect(calls[0]?.init?.body).toBeInstanceOf(FormData);

    const body = calls[0]?.init?.body as FormData;
    expect(body.get("name")).toBe("Refund policy");
    expect(body.get("description")).toBe("Refund details");
    const file = body.get("file") as File;
    expect(file.name).toBe("refund-policy.md");
    expect(await file.text()).toBe("# Refund policy");
  });

  test("deletes knowledge documents with DELETE", async () => {
    const { fetchImpl, calls } = mockFetch({ id: "doc-1" }, 200);
    const client = new OrbitaliClient(config, fetchImpl);

    const result = await client.deleteKnowledgeDocument("agent-1", "doc-1");

    expect(result).toEqual({ id: "doc-1" });
    expect(calls[0]?.url).toBe("https://api.example.com/public/v1/agents/agent-1/knowledge/doc-1");
    expect(calls[0]?.init?.method).toBe("DELETE");
  });

  test("updates agent tools with PUT", async () => {
    const { fetchImpl, calls } = mockFetch({ id: "tool-1" }, 200);
    const client = new OrbitaliClient(config, fetchImpl);

    const result = await client.updateAgentTool("agent-1", "tool-1", {
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
      toolRuntimeMetadata: []
    });

    expect(result).toEqual({ id: "tool-1" });
    expect(calls[0]?.url).toBe("https://api.example.com/public/v1/agents/agent-1/tools/tool-1");
    expect(calls[0]?.init?.method).toBe("PUT");
    const headers = calls[0]?.init?.headers as Record<string, string>;
    expect(headers["Content-Type"]).toBe("application/json");
  });

  test("deletes agent tools with DELETE", async () => {
    const { fetchImpl, calls } = mockFetch({ id: "tool-1" }, 200);
    const client = new OrbitaliClient(config, fetchImpl);

    const result = await client.deleteAgentTool("agent-1", "tool-1");

    expect(result).toEqual({ id: "tool-1" });
    expect(calls[0]?.url).toBe("https://api.example.com/public/v1/agents/agent-1/tools/tool-1");
    expect(calls[0]?.init?.method).toBe("DELETE");
  });

  test("reports API error message and Zod issues", async () => {
    const issues = [{ path: ["name"], message: "Name is required" }];
    const { fetchImpl } = mockFetch({ error: "Invalid request body", issues }, 400);
    const client = new OrbitaliClient(config, fetchImpl);

    const promise = client.createAgent({} as never);

    await expect(promise).rejects.toBeInstanceOf(OrbitaliApiError);
    try {
      await client.createAgent({} as never);
    } catch (error) {
      const apiError = error as OrbitaliApiError;
      expect(apiError.status).toBe(400);
      expect(apiError.message).toBe("Invalid request body");
      expect(apiError.issues).toEqual([{ path: "name", message: "Name is required" }]);
    }
  });

  test("lists phone numbers with GET", async () => {
    const { fetchImpl, calls } = mockFetch([], 200);
    const client = new OrbitaliClient(config, fetchImpl);

    const result = await client.listPhoneNumbers();

    expect(result).toEqual([]);
    expect(calls[0]?.url).toBe("https://api.example.com/public/v1/phone-numbers");
    expect(calls[0]?.init?.method).toBe("GET");
  });

  test("assigns a phone number with POST", async () => {
    const { fetchImpl, calls } = mockFetch({ phoneNumberId: "pn-1" }, 201);
    const client = new OrbitaliClient(config, fetchImpl);

    const result = await client.assignPhoneNumber("agent-1", { phoneNumberId: "pn-1", handoffPhoneNumber: "+15550001234" });

    expect(result).toEqual({ phoneNumberId: "pn-1" });
    expect(calls[0]?.url).toBe("https://api.example.com/public/v1/agents/agent-1/phone-numbers");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(calls[0]?.init?.body).toBe(JSON.stringify({ phoneNumberId: "pn-1", handoffPhoneNumber: "+15550001234" }));
  });

  test("unassigns a phone number with DELETE", async () => {
    const { fetchImpl, calls } = mockFetch({ phoneNumberId: "pn-1" }, 200);
    const client = new OrbitaliClient(config, fetchImpl);

    const result = await client.unassignPhoneNumber("agent-1", "pn-1");

    expect(result).toEqual({ phoneNumberId: "pn-1" });
    expect(calls[0]?.url).toBe("https://api.example.com/public/v1/agents/agent-1/phone-numbers/pn-1");
    expect(calls[0]?.init?.method).toBe("DELETE");
  });

  test("lists calls with encoded query parameters", async () => {
    const { fetchImpl, calls } = mockFetch([], 200);
    const client = new OrbitaliClient(config, fetchImpl);

    await client.listCalls({ agentId: "agent-1", limit: 10 });

    expect(calls[0]?.url).toBe("https://api.example.com/public/v1/calls?agentId=agent-1&limit=10");
    expect(calls[0]?.init?.method).toBe("GET");
  });

  test("lists calls without a query string when no params are set", async () => {
    const { fetchImpl, calls } = mockFetch([], 200);
    const client = new OrbitaliClient(config, fetchImpl);

    await client.listCalls();

    expect(calls[0]?.url).toBe("https://api.example.com/public/v1/calls");
  });

  test("gets call detail with GET", async () => {
    const { fetchImpl, calls } = mockFetch({ id: "call-1", messages: [] }, 200);
    const client = new OrbitaliClient(config, fetchImpl);

    const result = await client.getCall("call-1");

    expect(result).toMatchObject({ id: "call-1" });
    expect(calls[0]?.url).toBe("https://api.example.com/public/v1/calls/call-1");
  });

  test("lists agent logs with filter query parameters", async () => {
    const { fetchImpl, calls } = mockFetch({ logs: [], pagination: { limit: 25, offset: 0, hasNextPage: false, hasPreviousPage: false } }, 200);
    const client = new OrbitaliClient(config, fetchImpl);

    await client.listAgentLogs("agent-1", { severity: "error", limit: 50, offset: 25, sessionId: "abc123" });

    expect(calls[0]?.url).toBe(
      "https://api.example.com/public/v1/agents/agent-1/logs?severity=error&limit=50&offset=25&sessionId=abc123"
    );
    expect(calls[0]?.init?.method).toBe("GET");
  });

  test("surfaces the concurrency conflict code from the API", async () => {
    const { fetchImpl } = mockFetch(
      { error: "Agent update conflict", details: "Agent changed since expectedUpdatedAt" },
      409
    );
    const client = new OrbitaliClient(config, fetchImpl);

    try {
      await client.patchAgent("agent-1", {} as never);
      throw new Error("expected patchAgent to reject");
    } catch (error) {
      const apiError = error as OrbitaliApiError;
      expect(apiError.status).toBe(409);
      expect(apiError.message).toBe("Agent update conflict");
      expect(apiError.details).toBe("Agent changed since expectedUpdatedAt");
    }
  });
});
