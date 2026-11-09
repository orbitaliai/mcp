# Orbitali host installation

Version 0.2.1, prepared 2026-10-23. This release updates branding and listing copy.
Production OAuth is not deployed by this change.
Deploy compatible authorization services and MCP changes first. Every release package
uses `https://mcp.orbitali.ai/mcp`. Local testing used copies pointing at localhost;
no localhost endpoint or credential is shipped. See [verification](HOST-TESTS.md).

## ChatGPT / Codex desktop

Extract `orbitali-openai-desktop-0.2.1.zip` to a permanent directory. Add that directory
as a local marketplace using Codex's Plugins marketplace UI, or on a CLI exposing the
plugin commands:

```sh
rtk codex plugin marketplace add /absolute/path/to/extracted-desktop-package
rtk codex plugin add orbitali@orbitali-local
```

The archive contains `.agents/plugins/marketplace.json` and `orbitali/`. Reload the plugin,
connect Orbitali, sign in, select an organization and review consent. Disable any old
manual Orbitali MCP connection during the clean-install check. Restore it after testing
if still needed.

The compatible desktop `mcp.json` contains only schema/type/url. OAuth is discovered from
the server's 401 challenge. The original runtime error concerned server-level `extensions`,
not the top-level plugin branding metadata. The separate submission ZIP retains OpenAI's
OAuth `com.openai` extension. Do not install that variant into the older parser.
The lowest actually tested runtime is 0.163.0-alpha.10.2 bundled with desktop 26.1013.31256;
CLI 0.163.0 also parsed the package. Earlier versions have not been certified.

The submission ZIP requires separate publisher review and portal validation. A desktop
installation is not a cloud ChatGPT connector test. Cloud hosts need a reachable HTTPS endpoint.

## Claude Code

Extract `orbitali-claude-marketplace-0.2.1.zip`, then:

```sh
rtk claude plugin validate /absolute/path/to/extracted-claude-package/orbitali
rtk claude plugin marketplace add /absolute/path/to/extracted-claude-package
rtk claude plugin install orbitali@orbitali
rtk claude mcp login plugin:orbitali:orbitali
rtk claude mcp list
```

In an interactive session, `/mcp` also opens authentication. A Claude model login and an
Orbitali OAuth login are separate. Port 3118 must be free during login. The authorization
server must register the public client `orbitali-claude-code` with exactly
`http://localhost:3118/callback`; `.mcp.json` pins this client and callback port.
There is no client secret. PKCE is required. This compatibility path avoids weakening
redirect validation for Claude Code 2.1.212's dynamic `localhost` CIMD callback.
Do not change the callback port without registering the exact replacement URI.

Claude.ai / Claude Desktop remote connectors are configured separately under
Settings → Connectors → Add custom connector, using the hosted MCP URL. They do not
install this Claude Code plugin. Use discovery and the callback emitted by the actual
host; never guess or wildcard a callback. If a host's CIMD grants/authentication methods
are incompatible, register the exact observed HTTPS callback as a public DCR client and
enter its client ID in advanced connector settings. Cloud connector testing requires a
reachable nonproduction HTTPS deployment and an eligible account. It is unverified here.
Public connector and plugin submissions are separate links on the
[Claude marketplace](https://claude.com/marketplace/connectors-plugins).

## Gemini CLI

Extract `orbitali-gemini-extension-0.2.1.zip`; `gemini-extension.json` is at its root:

```sh
rtk gemini extensions install /absolute/path/to/extracted-gemini-package
rtk gemini extensions list
rtk gemini
```

Review the install trust prompt. In Gemini run `/mcp auth orbitali`, then `/mcp`.
Use a supported CLI and model account. Version0.30.0 accepted this extension but failed
live validation (`UNSUPPORTED_CLIENT`); its discovery also rejected the
`/mcp` resource as differing from `/`. Do not change the server's audience to `/` to
hide that failure. Upgrade/retest an eligible client; a working minimum version is
not yet established. DCR registers the exact callback selected by the client.

A Git repository with `gemini-extension.json` at its root can be installed using
`gemini extensions install <repository-url>`; publish the extension folder as its own
repository/release or use the extracted archive. No repository release or gallery listing
was published by this task. Review Google's extension distribution documentation before
submitting a gallery entry.

Consumer Gemini custom apps are a different product. As of 2026-10-23,
[Google documents](https://support.google.com/gemini/answer/17209137?hl=en-PR) US-only,
age 18+, personal accounts, English and Keep Activity enabled. Add the MCP URL in the web
app's Connected Apps settings; connected apps can then be used on web/mobile. This
leaves a European availability gap. The CLI ZIP does not make consumer Gemini available
in Europe. No consumer Gemini end-to-end test is claimed.

## Repeatable acceptance test for every host

1. Use a synthetic organization, no customer transcripts or phone numbers. Remove/disable
   old manual connections, install the host package and confirm the plugin owns its server.
2. Connect, sign in and check the client identity, callback hostname, organization and scopes.
   Deny once; verify no tools can run. Connect again and approve the intended test scopes.
3. List agents. Create a static draft named `<host> OAuth synthetic draft`, language en-US,
   voice eve, fixed synthetic instructions/greeting, null server URL/secret and no phones.
4. Read the draft, then patch only its name using `expectedUpdatedAt` from that read.
   Read it back; verify draft status and unchanged configuration. Never activate or call it.
5. Wait beyond the ten-minute access lifetime; list again to exercise client refresh.
   Do not copy credentials into prompts. Record actual refresh success/failure.
6. Dashboard Settings → Connected applications → Disconnect. The next authorization
   check must reject the old access/refresh/internal credential. A client may offer a new
   login automatically; cancel it when testing denial.
7. Reconnect with fresh consent; list again, then revoke. Record version and each result.
   Test two organizations and membership removal using synthetic users where available.

Package installation, OAuth, tool discovery, model tool execution, refresh, reconnect,
and revocation are separate evidence columns; do not infer one from another.
