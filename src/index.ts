#!/usr/bin/env bun
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { OrbitaliClient } from "./client";
import { loadConfig } from "./config";
import { SERVER_NAME, SERVER_VERSION, createServer } from "./server";

/**
 * Entrypoint for the Orbitali MCP server (stdio transport).
 *
 * MCP protocol messages are written to stdout by the transport; all logs and
 * diagnostics go to stderr so they never corrupt the protocol stream.
 */
async function main(): Promise<void> {
  const config = loadConfig();
  const client = new OrbitaliClient(config);
  const server = createServer(client);

  const transport = new StdioServerTransport();
  await server.connect(transport);

  let shuttingDown = false;
  async function shutdown(signal: NodeJS.Signals): Promise<void> {
    if (shuttingDown) {
      return;
    }
    shuttingDown = true;
    process.off("SIGINT", onSignal);
    process.off("SIGTERM", onSignal);
    process.stderr.write(`Received ${signal}; shutting down ${SERVER_NAME} MCP server\n`);
    await transport.close();
    process.exit(0);
  }

  function onSignal(signal: NodeJS.Signals): void {
    void shutdown(signal).catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      process.stderr.write(`Failed to shut down Orbitali MCP server cleanly: ${message}\n`);
      process.exit(1);
    });
  }

  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  process.stderr.write(`${SERVER_NAME} MCP server ${SERVER_VERSION} ready on stdio (API: ${config.baseUrl})\n`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to start Orbitali MCP server: ${message}\n`);
  process.exit(1);
});
