import { describe, expect, test } from "bun:test";
import { createHttpHandler, type HttpConfig } from "./http";
import { toolScopes } from "./authorization";

const config: HttpConfig = { baseUrl: "https://api.example.test", issuer: "https://api.example.test", resource: "https://mcp.example.test/mcp", exchangeSecret: "synthetic-service-credential", legacyApiKeys: true };
function request(token?: string, method = "tools/list", params: unknown = {}) {
  return new Request(config.resource, { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", ...(token ? { authorization: `Bearer ${token}` } : {}) }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }) });
}
function fixture(scope = "agents:read", status = 200) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const handler = createHttpHandler(config, async (url, init) => {
    calls.push({ url, init });
    if (url.endsWith("/oauth/mcp/exchange")) return Response.json({ access_token: "orb_mi_synthetic", scope }, { status });
    if (url.endsWith("/oauth/mcp/legacy-check")) return Response.json({ active: true }, { status });
    if (url.endsWith("/agents")) return Response.json([]);
    throw new Error("Unexpected backend operation");
  });
  return { handler, calls };
}
describe("MCP HTTP authorization boundary", () => {
  test("unauthenticated challenge and protected-resource discovery", async () => {
    const { handler, calls } = fixture();
    const denied = await handler(request());
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toContain('resource_metadata="https://mcp.example.test/.well-known/oauth-protected-resource/mcp"');
    expect(denied.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate");
    const metadata = await (await handler(new Request("https://mcp.example.test/.well-known/oauth-protected-resource/mcp"))).json();
    expect(metadata.resource).toBe(config.resource);
    expect(metadata.authorization_servers).toEqual([config.issuer]);
    expect(calls).toHaveLength(0);
  });
  test("real SDK advertises all tool scopes and annotations", async () => {
    const { handler } = fixture();
    const response = await handler(request("orb_oat_synthetic"));
    expect(response.status).toBe(200);
    const { result } = await response.json();
    expect(result.tools).toHaveLength(Object.keys(toolScopes).length);
    for (const tool of result.tools) {
      expect(tool._meta.securitySchemes).toEqual([{ type: "oauth2", scopes: toolScopes[tool.name] }]);
      expect(typeof tool.annotations.readOnlyHint).toBe("boolean");
    }
  });
  test("OAuth exchange uses internal credential only, never API-key fallback", async () => {
    const { handler, calls } = fixture();
    const response = await handler(request("orb_oat_synthetic", "tools/call", { name: "list_agents", arguments: {} }));
    expect(response.status).toBe(200);
    expect((await response.json()).result.isError).not.toBe(true);
    expect(calls.map(c => c.url)).toEqual([config.baseUrl + "/oauth/mcp/exchange", config.baseUrl + "/mcp-resource/v1/agents"]);
    expect(new Headers(calls[0]!.init!.headers).get("x-orbitali-mcp-service")).toBe(config.exchangeSecret);
    expect(new Headers(calls[1]!.init!.headers).get("authorization")).toBe("Bearer orb_mi_synthetic");
    expect(calls.every(c => c.init?.redirect === "error")).toBe(true);
    const invalid = fixture("agents:read", 401);
    expect((await invalid.handler(request("orb_oat_invalid"))).status).toBe(401);
    expect(invalid.calls).toHaveLength(1);
    expect((await invalid.handler(request("unrecognized-token"))).status).toBe(401);
    expect(invalid.calls).toHaveLength(1);
  });
  test("legacy keys remain explicit and validated before discovery", async () => {
    const { handler, calls } = fixture();
    expect((await handler(request("orb_sk_synthetic", "tools/call", { name: "list_agents" }))).status).toBe(200);
    expect(calls.map(c => c.url)).toEqual([config.baseUrl + "/oauth/mcp/legacy-check", config.baseUrl + "/public/v1/agents"]);
    const invalid = fixture("", 401);
    expect((await invalid.handler(request("orb_sk_invalid"))).status).toBe(401);
    expect(invalid.calls).toHaveLength(1);
  });
  test("insufficient scope and remote file reads fail before tool execution", async () => {
    const { handler, calls } = fixture();
    const denied = await handler(request("orb_oat_synthetic", "tools/call", { name: "get_or_create_agent", arguments: {} }));
    expect(denied.status).toBe(403);
    expect(denied.headers.get("www-authenticate")).toContain("insufficient_scope");
    expect(calls).toHaveLength(1);
    const upload = fixture("knowledge:write");
    expect((await upload.handler(request("orb_oat_synthetic", "tools/call", { name: "upload_knowledge_document", arguments: { filePath: "/etc/passwd" } }))).status).toBe(400);
    expect(upload.calls).toHaveLength(1);
  });
  test("upstream failures fail closed without exposing internals", async () => {
    const { handler } = fixture("", 503);
    expect((await handler(request("orb_oat_synthetic"))).status).toBe(503);
    const throwing = createHttpHandler(config, async () => { throw new Error("sensitive upstream detail"); });
    const response = await throwing(request("orb_oat_synthetic"));
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain("sensitive");
  });
  test("name-only patches do not inject phone assignments", async () => {
    const id = "11111111-1111-4111-8111-111111111111";
    const patch = { name: "Updated synthetic draft", expectedUpdatedAt: "2026-10-23T00:00:00.000Z" };
    let sent: unknown;
    const handler = createHttpHandler(config, async (url, init) => {
      if (url.endsWith("/oauth/mcp/exchange")) return Response.json({ access_token: "orb_mi_synthetic", scope: "agents:read agents:write" });
      expect(url).toBe(config.baseUrl + "/mcp-resource/v1/agents/" + id);
      expect(init?.method).toBe("PATCH");
      sent = JSON.parse(String(init?.body));
      return Response.json({ id });
    });
    const response = await handler(request("orb_oat_synthetic", "tools/call", { name: "patch_agent", arguments: { agentId: id, ...patch } }));
    expect(response.status).toBe(200);
    expect((await response.json()).result.isError).not.toBe(true);
    expect(sent).toEqual(patch);
  });
});
