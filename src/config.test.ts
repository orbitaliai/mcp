import { describe, expect, test } from "bun:test";
import { DEFAULT_API_BASE_URL, loadConfig, normalizeBaseUrl } from "./config";

describe("loadConfig", () => {
  test("throws a clear error when ORBITALI_API_KEY is missing", () => {
    expect(() => loadConfig({})).toThrow("ORBITALI_API_KEY is required");
  });

  test("throws when ORBITALI_API_KEY is blank", () => {
    expect(() => loadConfig({ ORBITALI_API_KEY: "   " })).toThrow("ORBITALI_API_KEY is required");
  });

  test("defaults the base URL to production when unset", () => {
    const config = loadConfig({ ORBITALI_API_KEY: "sk_test" });
    expect(config).toEqual({ apiKey: "sk_test", baseUrl: DEFAULT_API_BASE_URL });
  });

  test("uses and normalizes a custom base URL", () => {
    const config = loadConfig({ ORBITALI_API_KEY: "sk_test", ORBITALI_API_BASE_URL: "https://api.example.com/" });
    expect(config.baseUrl).toBe("https://api.example.com");
  });

  test("falls back to the default when the base URL is blank", () => {
    const config = loadConfig({ ORBITALI_API_KEY: "sk_test", ORBITALI_API_BASE_URL: "  " });
    expect(config.baseUrl).toBe(DEFAULT_API_BASE_URL);
  });
});

describe("normalizeBaseUrl", () => {
  test("strips trailing slashes", () => {
    expect(normalizeBaseUrl("https://api.orbitali.ai///")).toBe("https://api.orbitali.ai");
  });
});
