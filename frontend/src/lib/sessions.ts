import type { ChatMessage, MockInterviewPhase, TutorMode } from "@/lib/types";

export type TutorSession = {
  id: string;
  createdAt: number;
  mode: TutorMode;
  messages: ChatMessage[];
  hintLevel: number;
  firstHintDelivered: boolean;
  hasStarted: boolean;
  detectedMode: TutorMode | null;
  modeSuggestion: TutorMode | null;
  mockInterview: { phase: MockInterviewPhase; startedAt: number };
  secondsRemaining: number;
  /** True once the Discussion phase timer has expired — the interview is over. */
  interviewFinished: boolean;
  /** Snapshot of the shared-context conversation stashed when a Mock Interview starts. */
  sharedContextBackup: SharedContextSnapshot | null;
};

export type SharedContextSnapshot = {
  mode: TutorMode;
  messages: ChatMessage[];
  hintLevel: number;
  firstHintDelivered: boolean;
  hasStarted: boolean;
  detectedMode: TutorMode | null;
  modeSuggestion: TutorMode | null;
};

/** Modes that share one conversation context. Mock Interview is isolated from these. */
export const SHARED_MODES: TutorMode[] = [
  "hint_ladder",
  "brainstorming",
  "pattern_recognition",
  "complexity_checker",
];

export const SESSIONS_STORAGE_KEY = "dsa-tutor-sessions-v1";
export const ACTIVE_SESSION_STORAGE_KEY = "dsa-tutor-active-session";

/** Short, scannable sidebar title derived from the first user message. */
export function titleForSession(session: TutorSession): string {
  const firstUser = session.messages.find((m) => m.role === "user")?.content?.trim();
  if (!firstUser) return "New chat";
  const singleLine = firstUser.replace(/\s+/g, " ");
  return singleLine.length > 42 ? `${singleLine.slice(0, 42)}…` : singleLine;
}

/** Load persisted sessions from localStorage (returns [] if unavailable/empty/corrupt). */
export function loadSessions(): TutorSession[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(SESSIONS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as TutorSession[];
    if (!Array.isArray(parsed)) return [];
    // Backfill fields that older saved sessions may lack.
    return parsed.map((s) => ({
      ...s,
      interviewFinished: s.interviewFinished ?? false,
      sharedContextBackup: s.sharedContextBackup ?? null,
      mockInterview: s.mockInterview ?? { phase: "Clarifying Questions", startedAt: Date.now() },
    }));
  } catch {
    return [];
  }
}

export function saveSessions(sessions: TutorSession[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(sessions));
  } catch {
    // Storage full/unavailable — history persistence is best-effort.
  }
}

