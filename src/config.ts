export const DEFAULT_API_BASE_URL = "https://api.orbitali.ai";

export interface OrbitaliMcpConfig {
  apiKey: string;
  baseUrl: string;
}

/**
 * Loads MCP server configuration from environment variables.
 *
 * - `ORBITALI_API_KEY` is required.
 * - `ORBITALI_API_BASE_URL` defaults to the production API.
 */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): OrbitaliMcpConfig {
  const apiKey = env.ORBITALI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("ORBITALI_API_KEY is required. Set it in the MCP server environment before starting.");
  }

  const rawBaseUrl = env.ORBITALI_API_BASE_URL?.trim();
  const baseUrl = normalizeBaseUrl(rawBaseUrl && rawBaseUrl.length > 0 ? rawBaseUrl : DEFAULT_API_BASE_URL);

  return { apiKey, baseUrl };
}

/** Removes a single trailing slash so path joins are predictable. */
export function normalizeBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, "");
}
