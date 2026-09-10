import type { ChatRequest, StreamEvent, TutorMode } from "./types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000")).replace(/\/$/, "");

const HINT_TAG_RE = /\[HINT_ADVANCED:(true|false)\]/gi;
const PATTERN_TAG_RE = /\[PATTERN:[^\]]+\]/gi;

export function getApiUrl(): string {
  return API_URL;
}

export function stripHintTag(text: string): string {
  return text.replace(HINT_TAG_RE, "").trim();
}

export function stripTutorTags(text: string): string {
  return stripHintTag(text).replace(PATTERN_TAG_RE, "").trim();
}

export function getPatternTag(text: string): string | null {
  const match = text.match(/\[PATTERN:([^\]]+)\]/i);
  if (match?.[1]?.trim()) return match[1].trim();

  // The Pattern Recognition prompt puts the pattern name on the first line.
  // Extract it for the badge, but the caller must also strip it from the body
  // to avoid showing the same text twice.
  const firstLine = text.trim().split("\n", 1)[0]?.trim();
  return firstLine || null;
}

/** Remove the first line from text (used when it was extracted as a pattern badge). */
export function stripFirstLine(text: string): string {
  const idx = text.indexOf("\n");
  return idx === -1 ? "" : text.slice(idx + 1).trim();
}

async function parseErrorResponse(response: Response): Promise<string> {
  const raw = await response.text();
  try {
    const json = JSON.parse(raw) as { detail?: string | { msg: string }[] };
    if (typeof json.detail === "string") return json.detail;
    if (Array.isArray(json.detail)) {
      return json.detail.map((d) => d.msg).join("; ");
    }
  } catch {
    // not JSON
  }
  return raw || `HTTP ${response.status} ${response.statusText}`;
}

export async function checkBackendHealth(): Promise<{
  ok: boolean;
  detail: string;
}> {
  try {
    const response = await fetch(`${API_URL}/health`, { method: "GET" });
    if (!response.ok) {
      return {
        ok: false,
        detail: `Backend health check failed: HTTP ${response.status}`,
      };
    }
    const data = (await response.json()) as {
      status?: string;
      api_key?: string;
      model?: string;
    };
    return {
      ok: true,
      detail: `Backend reachable — API key ${data.api_key ?? "unknown"}, model ${data.model ?? "unknown"}`,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      ok: false,
      detail: `Cannot reach backend at ${API_URL}: ${message}. Is uvicorn running on port 8000?`,
    };
  }
}

export async function classifyIntent(message: string): Promise<TutorMode> {
  const response = await fetch(`${API_URL}/classify`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message }),
  });

  if (!response.ok) {
    throw new Error(`Classification failed: ${await parseErrorResponse(response)}`);
  }

  const result = (await response.json()) as { mode?: string };
  const validModes: TutorMode[] = [
    "hint_ladder",
    "brainstorming",
    "pattern_recognition",
    "complexity_checker",
    "mock_interview",
  ];
  if (!result.mode || !validModes.includes(result.mode as TutorMode)) {
    throw new Error("Classification returned an unknown mode");
  }
  return result.mode as TutorMode;
}

export async function streamChat(
  request: ChatRequest,
  onToken: (token: string) => void,
  onDone: (event: StreamEvent & { type: "done" }) => void,
  signal?: AbortSignal
): Promise<void> {
  const url = `${API_URL}/chat`;
  let response: Response;

  try {
    response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(request),
      signal,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[streamChat] Network failure:", { url, error: err });
    throw new Error(
      `Network error reaching ${url}: ${message}. ` +
        `Confirm the FastAPI backend is running (uvicorn main:app --reload --port 8000) ` +
        `and CORS allows ${typeof window !== "undefined" ? window.location.origin : "localhost:3000"}.`
    );
  }

  if (!response.ok) {
    const detail = await parseErrorResponse(response);
    console.error("[streamChat] HTTP error:", {
      url,
      status: response.status,
      detail,
    });
    throw new Error(`Backend error (${response.status}): ${detail}`);
  }

  const reader = response.body?.getReader();
  if (!reader) {
    throw new Error("Backend returned 200 but no response body to stream");
  }

  const decoder = new TextDecoder();
  let buffer = "";
  let receivedDone = false;

  const handleSseLine = (line: string) => {
    if (!line.startsWith("data: ")) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(line.slice(6)) as StreamEvent;
    } catch {
      console.warn("[streamChat] Skipping malformed SSE line:", line);
      return;
    }
    if (event.type === "token") {
      onToken(event.content);
    } else if (event.type === "done") {
      receivedDone = true;
      onDone(event);
    } else if (event.type === "error") {
      console.error("[streamChat] SSE error event:", event.message);
      throw new Error(event.message);
    }
  };

  try {
    while (true) {
      const { done, value } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() || "";

      for (const line of lines) {
        handleSseLine(line);
      }

      if (done) break;
    }

    if (buffer.trim()) {
      handleSseLine(buffer.trim());
    }
  } catch (err) {
    if ((err as Error).name === "AbortError") throw err;
    const message = err instanceof Error ? err.message : String(err);
    console.error("[streamChat] Stream read failure:", { url, error: err });
    throw new Error(`Stream interrupted: ${message}`);
  }

  if (!receivedDone) {
    throw new Error(
      "Stream ended before a complete response — the backend may have crashed mid-request. Check the uvicorn terminal for errors."
    );
  }
}
