import { afterEach, describe, expect, test } from "bun:test";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { OrbitaliClient } from "./client";
import { SERVER_INSTRUCTIONS } from "./instructions";
import { createServer } from "./server";

let client: Client | undefined;
let server: McpServer | undefined;

afterEach(async () => {
  await client?.close();
  await server?.close();
  client = undefined;
  server = undefined;
});

describe("MCP discovery metadata", () => {
  test("sends agent architecture guidance during initialization", async () => {
    await connect();

    expect(client?.getInstructions()).toBe(SERVER_INSTRUCTIONS);
    expect(client?.getInstructions()).toContain("static: A no-code agent");
    expect(client?.getInstructions()).toContain("http: An agent with a prompt");
    expect(client?.getInstructions()).toContain("webhook: An agent connected to one serverUrl");
  });

  test("requires and describes agentType on the creation tool", async () => {
    await connect();

    const result = await client!.listTools();
    const tool = result.tools.find(({ name }) => name === "get_or_create_agent");
    const inputSchema = tool?.inputSchema as {
      required?: string[];
      properties?: Record<string, { description?: string }>;
    };

    expect(tool?.description).toContain("Select agentType from the application architecture");
    expect(inputSchema.required).toContain("agentType");
    expect(inputSchema.properties?.agentType?.description).toContain("Required integration architecture");
  });
});

async function connect(): Promise<void> {
  server = createServer(
    new OrbitaliClient({
      apiKey: "sk_test",
      baseUrl: "https://api.example.com"
    })
  );
  client = new Client({ name: "orbitali-mcp-test", version: "1.0.0" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

  await server.connect(serverTransport);
  await client.connect(clientTransport);
}
