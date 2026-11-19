# Host compatibility and validation

Validation date: 2026-10-23. Results used nonproduction services and synthetic data.
Production OAuth deployment and public marketplace approval are outside this validation.
Clean-install checks used plugin-owned connections rather than manual MCP connections.

| Host/version | Distribution and authentication | Verified | Remaining validation |
| --- | --- | --- | --- |
| Codex desktop 26.1013.31256, runtime 0.163.0-alpha.10.2 | Desktop marketplace; CIMD and PKCE S256 | Installation, discovery of 21 tools, consent, synthetic draft operations, refresh, revocation and reconnect | Repeat natural-expiry refresh with the final ten-minute token lifetime; earlier versions unverified |
| Codex CLI 0.163.0 | Desktop package | Package parsing | Full OAuth execution used the bundled desktop runtime |
| ChatGPT cloud | Submission package; CIMD | Package checks only | HTTPS staging and portal validation required |
| Claude Code 2.1.212 | Claude marketplace; registered public client and PKCE S256 | Installation, consent, synthetic draft operations, refresh and revocation | Same-profile revoke/reconnect sequence unverified |
| Claude consumer | Remote connector | Unverified | Reachable HTTPS deployment and eligible host account required |
| Gemini CLI 0.30.0 | Gemini extension; OAuth discovery | Extension installation/loading | OAuth execution blocked by UNSUPPORTED_CLIENT and resource-discovery mismatch; no working minimum version certified |
| Gemini consumer | Custom MCP connection | Unverified | US-only availability documented at validation time; see INSTALL.md for regional prerequisites |

## Automated validation

- 72 MCP tests and 237 assertions passed, covering SDK discovery, scope enforcement,
  remote file-read restrictions, explicit legacy authentication and patch behavior.
- MCP typecheck and build passed.
- Four archives inspected and deterministic rebuild hashes verified.
- Claude native plugin validation passed.

## Compatibility notes

Claude Code proactively refreshes inside five minutes. The authorization service uses
ten-minute access tokens to avoid repeated immediate refreshes. A real-host read passed
after this correction. Revocation is checked on the next authorization check.

The OpenAI desktop configuration passes the portable MCP schema. The separate submission
configuration follows [OpenAI's documented OAuth extension](https://developers.openai.com/plugins/build/plugins),
but that server-level extension is rejected by the base portable schema. Portal validation
is still required; do not install the submission variant in the older desktop parser.

Cloud flows, multi-organization browser selection and live identity-provider membership
removal remain unverified. Installation alone does not prove OAuth or tool execution.
Use the repeatable acceptance checklist in [INSTALL.md](INSTALL.md) before release.
