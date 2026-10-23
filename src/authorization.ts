export const toolScopes: Record<string, readonly string[]> = {
  list_agents: ["agents:read"], get_agent: ["agents:read"], list_agent_tools: ["agents:read"],
  list_mcp_integrations: ["integrations:read"], list_agent_mcp_tools: ["agents:read"],
  configure_agent_mcp_tools: ["agents:read", "agents:write", "integrations:read"],
  get_or_create_agent: ["agents:read", "agents:write"], patch_agent: ["agents:read", "agents:write"],
  ensure_agent_tools: ["agents:read", "agents:write"], update_agent_tool: ["agents:write"], delete_agent_tool: ["agents:write"],
  list_knowledge_documents: ["knowledge:read"], upload_knowledge_document: ["knowledge:write"], delete_knowledge_document: ["knowledge:write"],
  create_realtime_session: ["calls:write"], list_phone_numbers: ["telephony:read"],
  assign_phone_number: ["telephony:read", "telephony:write"], unassign_phone_number: ["telephony:read", "telephony:write"],
  list_calls: ["calls:read"], get_call: ["calls:read"], list_agent_logs: ["calls:read"]
};
export function toolMetadata(name: string) {
  const scopes = toolScopes[name];
  if (!scopes) throw new Error(`Missing authorization policy for ${name}`);
  const readOnly = scopes.every(s => s.endsWith(":read"));
  return {
    annotations: { readOnlyHint: readOnly, destructiveHint: !readOnly && name !== "get_or_create_agent" && name !== "upload_knowledge_document" && name !== "create_realtime_session", idempotentHint: readOnly, openWorldHint: !readOnly },
    _meta: { securitySchemes: [{ type: "oauth2", scopes }] }
  };
}
