#!/usr/bin/env bun
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { OrbitaliClient } from "./client";
import { DEFAULT_API_BASE_URL, normalizeBaseUrl } from "./config";
import { SERVER_NAME, SERVER_VERSION, createServer } from "./server";

const port = Number(process.env.MCP_PORT ?? "3000");
const baseUrl = normalizeBaseUrl(process.env.ORBITALI_API_BASE_URL?.trim() || DEFAULT_API_BASE_URL);
const mcpPath = process.env.MCP_PATH?.trim() || "/mcp";

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" }
  });
}

function unauthorized(): Response {
  return json(401, {
    error: "unauthorized",
    message: "Pass your Orbitali API key as Authorization: Bearer <key>."
  });
}

function readBearerToken(request: Request): string | undefined {
  const authorization = request.headers.get("authorization")?.trim();
  if (!authorization) {
    return undefined;
  }

  const [scheme, ...rest] = authorization.split(/\s+/);
  const token = rest.join(" ").trim();
  if (scheme?.toLowerCase() !== "bearer" || token.length === 0) {
    return undefined;
  }

  return token;
}

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("access-control-allow-origin", "*");
  headers.set("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
  headers.set(
    "access-control-allow-headers",
    "Authorization, Content-Type, Last-Event-ID, MCP-Protocol-Version, MCP-Session-Id"
  );
  headers.set("access-control-expose-headers", "MCP-Protocol-Version, MCP-Session-Id");
  return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function handleMcp(request: Request): Promise<Response> {
  const apiKey = readBearerToken(request);
  if (!apiKey) {
    return unauthorized();
  }

  const client = new OrbitaliClient({ apiKey, baseUrl });
  const server = createServer(client);
  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
    enableJsonResponse: true
  });

  try {
    await server.connect(transport);
    return await transport.handleRequest(request);
  } finally {
    try {
      await transport.close();
    } catch (error) {
      process.stderr.write(`Failed to close remote MCP transport: ${errorMessage(error)}\n`);
    }

    try {
      await server.close();
    } catch (error) {
      process.stderr.write(`Failed to close remote MCP server: ${errorMessage(error)}\n`);
    }
  }
}

Bun.serve({
  port,
  async fetch(request) {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return withCors(new Response(null, { status: 204 }));
    }

    if (request.method === "GET" && url.pathname === "/healthz") {
      return json(200, { ok: true, name: SERVER_NAME, version: SERVER_VERSION });
    }

    if (url.pathname !== mcpPath) {
      return json(404, { error: "not_found" });
    }

    if (!["GET", "POST", "DELETE"].includes(request.method)) {
      return json(405, { error: "method_not_allowed" });
    }

    try {
      return withCors(await handleMcp(request));
    } catch (error) {
      process.stderr.write(`Failed to handle remote MCP request: ${errorMessage(error)}\n`);
      return json(500, { error: "internal_server_error" });
    }
  }
});

process.stderr.write(
  `${SERVER_NAME} MCP server ${SERVER_VERSION} ready on Streamable HTTP ${mcpPath} (port ${port}, API: ${baseUrl})\n`
);
