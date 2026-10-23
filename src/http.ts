#!/usr/bin/env bun
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import { OrbitaliClient, type FetchLike } from "./client";
import { DEFAULT_API_BASE_URL, normalizeBaseUrl, resolveMcpResource } from "./config";
import { SERVER_NAME, SERVER_VERSION, createServer } from "./server";
import { toolScopes } from "./authorization";

export interface HttpConfig { baseUrl: string; resource: string; issuer: string; exchangeSecret: string; legacyApiKeys: boolean }
const scopes = [...new Set(Object.values(toolScopes).flat())];
function json(status: number, body: unknown, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { "cache-control": "no-store", ...headers } });
}
export function createHttpHandler(config: HttpConfig, fetchImpl: FetchLike = fetch) {
  const resource = new URL(config.resource);
  const metadataUrl = `${resource.origin}/.well-known/oauth-protected-resource${resource.pathname}`;
  const challenge = (error = "invalid_token", required = "agents:read") =>
    `Bearer resource_metadata="${metadataUrl}", error="${error}", error_description="Connect your Orbitali account with the required access", scope="${required}"`;
  const denied = (status = 401, error = "invalid_token", required?: string) => json(status, { error }, { "www-authenticate": challenge(error, required) });
  async function api(path: string, token: string, extra: Record<string, string> = {}) {
    return fetchImpl(`${config.baseUrl}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, ...extra }, redirect: "error", signal: AbortSignal.timeout(10_000) });
  }
  async function handle(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (request.method === "OPTIONS") return new Response(null, { status: 204 });
    if (request.method === "GET" && url.pathname === "/healthz") return json(200, { ok: true, name: SERVER_NAME, version: SERVER_VERSION });
    if (request.method === "GET" && ["/.well-known/oauth-protected-resource", `/.well-known/oauth-protected-resource${resource.pathname}`].includes(url.pathname)) {
      return json(200, { resource: config.resource, authorization_servers: [config.issuer], scopes_supported: scopes, bearer_methods_supported: ["header"] });
    }
    if (url.pathname !== resource.pathname) return json(404, { error: "not_found" });
    if (!["GET", "POST", "DELETE"].includes(request.method)) return json(405, { error: "method_not_allowed" });
    const token = /^Bearer ([^\s]+)$/i.exec(request.headers.get("authorization") ?? "")?.[1];
    if (!token) return denied();
    let client: OrbitaliClient;
    let granted: string[] | null = null;
    if (token.startsWith("orb_oat_")) {
      const response = await api("/oauth/mcp/exchange", token, { "x-orbitali-mcp-service": config.exchangeSecret });
      if (!response.ok) return response.status >= 500 ? json(503, { error: "temporarily_unavailable" }) : denied();
      const parsed = z.object({ access_token: z.string().startsWith("orb_mi_"), scope: z.string() }).safeParse(await response.json());
      if (!parsed.success) return json(503, { error: "temporarily_unavailable" });
      granted = parsed.data.scope.split(" ");
      client = new OrbitaliClient({ accessToken: parsed.data.access_token, baseUrl: config.baseUrl, apiPrefix: "/mcp-resource/v1" }, fetchImpl);
    } else if (config.legacyApiKeys && token.startsWith("orb_sk_")) {
      const response = await api("/oauth/mcp/legacy-check", token);
      if (!response.ok) return response.status >= 500 ? json(503, { error: "temporarily_unavailable" }) : denied();
      client = new OrbitaliClient({ apiKey: token, baseUrl: config.baseUrl }, fetchImpl);
    } else return denied();
    if (request.method === "POST") {
      const body: unknown = await request.clone().json().catch(() => null);
      const call = z.object({ method: z.literal("tools/call"), params: z.object({ name: z.string(), arguments: z.record(z.string(), z.unknown()).optional() }) }).safeParse(body);
      if (call.success) {
        const required = toolScopes[call.data.params.name];
        if (!required || (granted && required.some(scope => !granted!.includes(scope)))) return denied(403, "insufficient_scope", required?.join(" "));
        // Remote callers cannot read files on the MCP host. Stdio retains local file support.
        if (call.data.params.name === "upload_knowledge_document" && call.data.params.arguments?.filePath) return json(400, { error: "Remote uploads require content; filePath is only available over stdio" });
      }
    }
    const server = createServer(client);
    const transport = new WebStandardStreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    try { await server.connect(transport); return await transport.handleRequest(request); }
    finally { await transport.close().catch(() => {}); await server.close().catch(() => {}); }
  }
  return async (request: Request) => {
    let response: Response;
    try { response = await handle(request); } catch { response = json(503, { error: "temporarily_unavailable" }); }
    const headers = new Headers(response.headers);
    headers.set("access-control-allow-origin", "*");
    headers.set("access-control-allow-methods", "GET, POST, DELETE, OPTIONS");
    headers.set("access-control-allow-headers", "Authorization, Content-Type, MCP-Protocol-Version, MCP-Session-Id");
    headers.set("access-control-expose-headers", "WWW-Authenticate, MCP-Protocol-Version, MCP-Session-Id");
    return new Response(response.body, { status: response.status, headers });
  };
}
if (import.meta.main) {
  const resource = resolveMcpResource();
  const issuer = process.env.MCP_OAUTH_ISSUER || "https://api.orbitali.ai";
  const baseUrl = normalizeBaseUrl(process.env.ORBITALI_API_BASE_URL || DEFAULT_API_BASE_URL);
  const exchangeSecret = process.env.MCP_EXCHANGE_SECRET || "";
  if (exchangeSecret.length < 32) throw new Error("MCP_EXCHANGE_SECRET must contain at least 32 random characters");
  for (const value of [resource, issuer, baseUrl]) {
    const url = new URL(value);
    if (url.username || url.password || url.search || url.hash || (url.protocol !== "https:" && !(process.env.NODE_ENV !== "production" && ["localhost", "127.0.0.1"].includes(url.hostname)))) throw new Error("Invalid MCP authorization URL");
  }
  Bun.serve({ port: Number(process.env.MCP_PORT || 3000), maxRequestBodySize: 1024 * 1024,
    fetch: createHttpHandler({ baseUrl, resource, issuer, exchangeSecret, legacyApiKeys: process.env.MCP_LEGACY_API_KEYS !== "false" }) });
  process.stderr.write(`${SERVER_NAME} ${SERVER_VERSION} MCP HTTP server ready\n`);
}
