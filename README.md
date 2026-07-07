# @orbitali/mcp

A local [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets coding
agents configure Orbitali voice agents through the public REST API (`/public/v1`).

It wraps the API with higher-level, workflow-safe tools so an agent can create or reuse voice
agents, create, update, or delete tools, and mint realtime sessions without hand-writing REST calls.
It can also upload, list, and delete agent knowledge documents.

The npm package runs locally over **stdio**. The production deployment also exposes a remote
Streamable HTTP endpoint for clients that support hosted MCP servers.

## Configuration

The server is configured with environment variables:

| Variable                | Required | Default                    | Description                          |
| ----------------------- | -------- | -------------------------- | ------------------------------------ |
| `ORBITALI_API_KEY`      | Yes      | —                          | Your Orbitali public API key.        |
| `ORBITALI_API_BASE_URL` | No       | `https://api.orbitali.ai`  | Override for self-hosted / staging.  |

Create an API key in the Orbitali dashboard under **Settings → API keys**.

## Tools

| Tool                       | Description                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------- |
| `list_agents`              | List the voice agents in the organization.                                                      |
| `list_agent_tools`         | List the custom tools configured on an agent.                                                   |
| `get_or_create_agent`      | Reuse an agent matching name, agentType, language, voiceName, and serverUrl, or create one.     |
| `patch_agent`              | Update agent fields (requires `expectedUpdatedAt` for optimistic concurrency).                  |
| `ensure_agent_tools`       | Create tools whose name does not already exist; optionally update existing matching tools.      |
| `update_agent_tool`        | Replace one existing custom tool definition on an agent.                                       |
| `delete_agent_tool`        | Delete one custom tool from an agent.                                                          |
| `list_knowledge_documents` | List the knowledge documents configured on an agent.                                            |
| `upload_knowledge_document`| Upload document text or a local `.txt`, `.md`, or `.pdf` file to an agent knowledge base.       |
| `delete_knowledge_document`| Delete a knowledge document from an agent.                                                      |
| `create_realtime_session`  | Mint a short-lived realtime session (token, expiration, WebSocket URL, audio protocol).         |

## Running locally

After installing from npm:

```bash
ORBITALI_API_KEY=sk_your_key bunx @orbitali/mcp
```

From a local checkout of this repository:

```bash
ORBITALI_API_KEY=sk_your_key bun run dev
```

## Running remotely

Remote MCP clients can connect to:

```text
https://mcp.orbitali.ai/mcp
```

Pass your Orbitali API key as an HTTP header:

```text
Authorization: Bearer sk_your_key
```

The hosted MCP process does not store or ship an Orbitali API key. Each request is authorized with
the key supplied by the MCP client.

## Coding-agent configuration

The server is launched by your coding agent over stdio. Point the agent at the package with
`bunx` and pass your API key in `env`.

### Claude Code

```bash
claude mcp add orbitali \
  --env ORBITALI_API_KEY=sk_your_key \
  -- bunx @orbitali/mcp
```

Or add it to `.mcp.json`:

```json
{
  "mcpServers": {
    "orbitali": {
      "command": "bunx",
      "args": ["@orbitali/mcp"],
      "env": {
        "ORBITALI_API_KEY": "sk_your_key"
      }
    }
  }
}
```

### Cursor (`.cursor/mcp.json`) / Windsurf / generic MCP clients

```json
{
  "mcpServers": {
    "orbitali": {
      "command": "bunx",
      "args": ["@orbitali/mcp"],
      "env": {
        "ORBITALI_API_KEY": "sk_your_key",
        "ORBITALI_API_BASE_URL": "https://api.orbitali.ai"
      }
    }
  }
}
```

## Development

```bash
bun install
bun run typecheck
bun test
```

## License

MIT

## Scope (v1)

Intentionally out of scope for v1: OAuth, phone-number management, billing, calls, and
dashboard-only endpoints. The public REST API remains the source of truth; `ensure_agent_tools`
matches existing tools by exact name.
