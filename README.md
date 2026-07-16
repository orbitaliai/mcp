# @orbitali/mcp

A local [Model Context Protocol](https://modelcontextprotocol.io) (MCP) server that lets coding
agents configure Orbitali voice agents through the public REST API (`/public/v1`).

It wraps the API with higher-level, workflow-safe tools so an agent can create or reuse voice
agents, create, update, or delete tools, and mint realtime sessions without hand-writing REST calls.
It can also upload, list, and delete agent knowledge documents, manage phone number assignments,
and inspect call history and agent runtime logs.

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
| `list_phone_numbers`       | List the organization's phone numbers with claim status and current agent assignment.           |
| `assign_phone_number`      | Assign a claimed phone number to an agent (moves it if assigned to another agent).              |
| `unassign_phone_number`    | Remove a phone number assignment from an agent; the number stays claimed.                       |
| `list_calls`               | List recent call history, optionally filtered by agent.                                         |
| `get_call`                 | Get one call with summary, transcript messages, tool invocations, and LLM usage.                |
| `list_agent_logs`          | List agent runtime logs from the last 24 hours (severity, session, pagination filters).         |

## Choosing an agent type

The MCP server sends coding agents workflow instructions during MCP initialization and requires an
explicit `agentType` when creating an agent. Coding agents should inspect the user's application and
select the integration architecture before calling `get_or_create_agent`:

- `static`: No-code agent with identity, instructions, and greeting stored in Orbitali. It makes no
  application server calls and does not support custom tools.
- `http`: Prompt and greeting stored in Orbitali. Each custom tool calls its own HTTPS endpoint,
  which suits applications that expose independent APIs for actions and lookups.
- `webhook`: One `serverUrl` receives `agent:tool-call` events and can also provide per-call prompts
  and greetings through `agent:assistant-request` events.

Agent type is immutable after creation. Static and HTTP agents use static prompts; only webhook
agents support dynamic prompts and greetings.

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

## Scope

Intentionally out of scope: OAuth, phone number purchasing/claiming, billing, and
dashboard-only endpoints. Phone number assignment, call history, and agent logs are supported;
buying or claiming numbers still happens in the dashboard. The public REST API remains the source
of truth; `ensure_agent_tools` matches existing tools by exact name.
