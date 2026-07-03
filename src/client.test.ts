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
