import type { OrbitaliMcpConfig } from "./config";
import type {
  Agent,
  AgentTool,
  AgentToolInput,
  CreateAgentRequest,
  CreateKnowledgeDocumentRequest,
  KnowledgeDocument,
  PatchAgentRequest
} from "./types";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
const defaultRequestTimeoutMs = 30_000;

/** Structured error raised when the Orbitali API returns a non-2xx response. */
export class OrbitaliApiError extends Error {
  readonly status: number;
  readonly code?: string;
  readonly issues?: unknown[];
  readonly details?: unknown;

  constructor(message: string, options: { status: number; code?: string; issues?: unknown[]; details?: unknown }) {
    super(message);
    this.name = "OrbitaliApiError";
    this.status = options.status;
    this.code = options.code;
    this.issues = options.issues;
    this.details = options.details;
  }
}

interface CreatedResponse {
  id: string;
}

export interface CreatedKnowledgeDocumentResponse extends CreatedResponse {
  name: string;
  description: string | null;
}

export interface KnowledgeFileUpload {
  fileName: string;
  file: Blob;
  name?: string;
  description?: string | null;
}

export interface RealtimeSessionResponse {
  token: string;
  expiresAt: string;
  websocketUrl: string;
  protocol: {
    inputAudio: { encoding: string; sampleRate: number };
    outputAudio: { encoding: string; sampleRate: number };
  };
}

/**
 * Thin REST client for the Orbitali public API (`/public/v1`).
 *
 * Keeps transport concerns (auth header, JSON encoding, error normalization)
 * out of the workflow handlers so those stay easy to unit test.
 */
export class OrbitaliClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly fetchImpl: FetchLike;

  constructor(config: OrbitaliMcpConfig, fetchImpl: FetchLike = fetch) {
    this.baseUrl = config.baseUrl;
    this.apiKey = config.apiKey;
    this.fetchImpl = fetchImpl;
  }

  listAgents(): Promise<Agent[]> {
    return this.request<Agent[]>("GET", "/public/v1/agents");
  }

  listAgentTools(agentId: string): Promise<AgentTool[]> {
    return this.request<AgentTool[]>("GET", `/public/v1/agents/${encodeURIComponent(agentId)}/tools`);
  }

  createAgent(body: CreateAgentRequest): Promise<CreatedResponse> {
    return this.request<CreatedResponse>("POST", "/public/v1/agents", body);
  }

  patchAgent(agentId: string, body: PatchAgentRequest): Promise<CreatedResponse> {
    return this.request<CreatedResponse>("PATCH", `/public/v1/agents/${encodeURIComponent(agentId)}`, body);
  }

  createAgentTool(agentId: string, body: AgentToolInput): Promise<CreatedResponse> {
    return this.request<CreatedResponse>("POST", `/public/v1/agents/${encodeURIComponent(agentId)}/tools`, body);
  }

  updateAgentTool(agentId: string, toolId: string, body: AgentToolInput): Promise<CreatedResponse> {
    return this.request<CreatedResponse>(
      "PUT",
      `/public/v1/agents/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolId)}`,
      body
    );
  }

  deleteAgentTool(agentId: string, toolId: string): Promise<CreatedResponse> {
    return this.request<CreatedResponse>(
      "DELETE",
      `/public/v1/agents/${encodeURIComponent(agentId)}/tools/${encodeURIComponent(toolId)}`
    );
  }

  listKnowledgeDocuments(agentId: string): Promise<KnowledgeDocument[]> {
    return this.request<KnowledgeDocument[]>("GET", `/public/v1/agents/${encodeURIComponent(agentId)}/knowledge`);
  }

  uploadKnowledgeText(agentId: string, body: CreateKnowledgeDocumentRequest): Promise<CreatedKnowledgeDocumentResponse> {
    return this.request<CreatedKnowledgeDocumentResponse>("POST", `/public/v1/agents/${encodeURIComponent(agentId)}/knowledge`, body);
  }

  uploadKnowledgeFile(agentId: string, upload: KnowledgeFileUpload): Promise<CreatedKnowledgeDocumentResponse> {
    const formData = new FormData();
    formData.set("file", upload.file, upload.fileName);
    if (upload.name !== undefined) {
      formData.set("name", upload.name);
    }
    if (upload.description !== undefined && upload.description !== null) {
      formData.set("description", upload.description);
    }

    return this.request<CreatedKnowledgeDocumentResponse>(
      "POST",
      `/public/v1/agents/${encodeURIComponent(agentId)}/knowledge`,
      formData
    );
  }

  deleteKnowledgeDocument(agentId: string, documentId: string): Promise<CreatedResponse> {
    return this.request<CreatedResponse>(
      "DELETE",
      `/public/v1/agents/${encodeURIComponent(agentId)}/knowledge/${encodeURIComponent(documentId)}`
    );
  }

  createRealtimeSession(agentId: string): Promise<RealtimeSessionResponse> {
    return this.request<RealtimeSessionResponse>("POST", `/public/v1/agents/${encodeURIComponent(agentId)}/realtime-sessions`);
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {
      Authorization: `Bearer ${this.apiKey}`,
      Accept: "application/json"
    };

    const init: RequestInit = { method, headers };

    if (body instanceof FormData) {
      init.body = body;
    } else if (body !== undefined) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }

    let response: Response;
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), defaultRequestTimeoutMs);
      init.signal = controller.signal;

      try {
        response = await this.fetchImpl(`${this.baseUrl}${path}`, init);
      } finally {
        clearTimeout(timeout);
      }
    } catch (error) {
      if (isAbortError(error)) {
        throw new OrbitaliApiError(`Orbitali API request timed out after ${defaultRequestTimeoutMs}ms (${method} ${path})`, {
          status: 0,
          code: "REQUEST_TIMEOUT"
        });
      }
      throw new OrbitaliApiError(`Failed to reach Orbitali API: ${(error as Error).message}`, { status: 0 });
    }

    const payload = await parseResponseBody(response);

    if (!response.ok) {
      throw toApiError(response.status, payload);
    }

    return payload as T;
  }
}

async function parseResponseBody(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) {
    return undefined;
  }
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function toApiError(status: number, payload: unknown): OrbitaliApiError {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    const message = typeof record.error === "string" ? record.error : `Orbitali API request failed with status ${status}`;
    return new OrbitaliApiError(message, {
      status,
      code: typeof record.code === "string" ? record.code : undefined,
      issues: summarizeIssues(record.issues),
      details: summarizeDetails(record.details)
    });
  }

  return new OrbitaliApiError(
    typeof payload === "string" && payload.length > 0 ? payload : `Orbitali API request failed with status ${status}`,
    { status }
  );
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}

function summarizeIssues(value: unknown): Array<{ path?: string; message: string }> | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const issues = value
    .map((issue) => {
      if (!issue || typeof issue !== "object") {
        return null;
      }
      const record = issue as Record<string, unknown>;
      const message = typeof record.message === "string" ? record.message : null;
      if (!message) {
        return null;
      }
      const path = Array.isArray(record.path) ? record.path.map(String).join(".") : undefined;
      return path ? { path, message } : { message };
    })
    .filter((issue): issue is { path?: string; message: string } => Boolean(issue));

  return issues.length > 0 ? issues : undefined;
}

function summarizeDetails(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
