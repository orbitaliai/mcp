export const SERVER_INSTRUCTIONS = `Orbitali is a platform for creating and operating realtime voice agents. This server configures Orbitali through its public API.

When a user asks you to build an agent that connects to their application, inspect the application's architecture and intended call flow before choosing an agent type. Choose explicitly; an agent's type cannot be changed after creation.

Agent types:
- static: A no-code agent whose identity, instructions, and greeting are stored in Orbitali. It makes no application server calls and does not support custom tools. Choose this when the agent only needs a fixed prompt, phone/realtime access, and optionally uploaded knowledge.
- http: An agent with a prompt and greeting stored in Orbitali. Each custom tool calls its own HTTPS toolUrl using its configured method, headers, static parameters, and runtime metadata. Choose this when the application exposes independent HTTP endpoints for actions or lookups and does not need per-call dynamic prompts.
- webhook: An agent connected to one serverUrl. Orbitali sends agent:tool-call events to that URL for custom tools and, when dynamic prompts are enabled, agent:assistant-request events for per-call instructions and greetings. Choose this for centralized event handling, full server control, or behavior that depends on call context.

For application-integration requests, implement or identify the required application endpoint or endpoints, then configure the matching Orbitali agent and tools. Prefer http for direct, independent API operations; prefer webhook when one integration endpoint should dispatch events or when prompts/greetings must be generated dynamically. If the requirements and codebase do not establish which architecture is intended, ask the user before creating the agent.

Creation rules:
- Always provide agentType deliberately.
- static and http agents require static prompts. Only webhook agents support dynamic prompts and dynamic greetings.
- A webhook agent needs serverUrl before dynamic prompts or enabled custom tools can work.
- An http tool needs its own toolUrl. A static agent cannot have custom tools.
- Agents are created as drafts. Activate an agent with patch_agent only when the user wants it available for calls or realtime sessions.
- Use list_agents before get_or_create_agent when existing-agent context matters. Use returned updatedAt as expectedUpdatedAt for patch_agent.

Security:
- Keep the Orbitali API key on the server; never expose it to browser code.
- When using a webhook serverSecret, verify x-orbitali-signature against the raw request body before parsing it.`;
