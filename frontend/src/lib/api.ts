import type { ChatRequest, StreamEvent, TutorMode } from "./types";

const API_URL = (process.env.NEXT_PUBLIC_API_URL || (process.env.NODE_ENV === "production" ? "" : "http://localhost:8000")).replace(/\/$/, "");

/** Calm, on-brand message shown whenever the model or backend is unavailable. */
export const TUTOR_BUSY_MESSAGE =
  "The tutor is a bit busy right now — try again in a moment.";

const TUTOR_OFFLINE_MESSAGE =
  "Can't reach the tutor right now — make sure the backend is running and try again.";

const TUTOR_CLASSIFY_MESSAGE =
  "Couldn't figure out the best mode — try picking one from the menu.";

/** Map raw fetch/Gemini/backend failures to user-facing copy (technical detail stays in console). */
export function toFriendlyError(err: unknown, context: "chat" | "classify" | "health" = "chat"): string {
  const raw = err instanceof Error ? err.message : String(err);

  if (/502|503|504|429|high demand|overloaded|rate limit|resource exhausted|quota|unavailable/i.test(raw)) {
    return TUTOR_BUSY_MESSAGE;
  }
  if (/network error|failed to fetch|cannot reach|ECONNREFUSED|fetch failed|reach backend|reach the tutor/i.test(raw)) {
    return TUTOR_OFFLINE_MESSAGE;
  }
  if (/stream interrupted|complete response|crashed mid-request|sse error/i.test(raw)) {
    return TUTOR_BUSY_MESSAGE;
  }
  if (context === "classify" || /classification/i.test(raw)) {
    return TUTOR_CLASSIFY_MESSAGE;
  }
  if (context === "health") {
    return TUTOR_OFFLINE_MESSAGE;
  }
  return TUTOR_BUSY_MESSAGE;
}

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
      console.error("[checkBackendHealth] HTTP error:", response.status);
      return {
        ok: false,
        detail: TUTOR_OFFLINE_MESSAGE,
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
    console.error("[checkBackendHealth] unreachable:", { url: API_URL, error: err });
    return {
      ok: false,
      detail: toFriendlyError(err, "health"),
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
    const detail = await parseErrorResponse(response);
    console.error("[classifyIntent] HTTP error:", { status: response.status, detail });
    throw new Error(toFriendlyError(detail, "classify"));
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
    console.error("[classifyIntent] unknown mode:", result.mode);
    throw new Error(TUTOR_CLASSIFY_MESSAGE);
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
    console.error("[streamChat] Network failure:", { url, error: err });
    throw new Error(toFriendlyError(err, "chat"));
  }

  if (!response.ok) {
    const detail = await parseErrorResponse(response);
    console.error("[streamChat] HTTP error:", {
      url,
      status: response.status,
      detail,
    });
    throw new Error(toFriendlyError(`${response.status}: ${detail}`, "chat"));
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
      throw new Error(toFriendlyError(event.message, "chat"));
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
    console.error("[streamChat] Stream read failure:", { url, error: err });
    throw new Error(toFriendlyError(err, "chat"));
  }

  if (!receivedDone) {
    console.error("[streamChat] Stream ended without done event:", { url });
    throw new Error(TUTOR_BUSY_MESSAGE);
  }
}
