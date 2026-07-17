export type TutorMode =
  | "hint_ladder"
  | "brainstorming"
  | "pattern_recognition"
  | "complexity_checker"
  | "mock_interview";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
}

export interface ChatRequest {
  mode: TutorMode;
  message: string;
  history: { role: string; content: string }[];
  hint_level?: number;
  action?: "next_hint";
  mock_interview_phase?: MockInterviewPhase;
  mock_interview_timer_expired?: boolean;
}

export type MockInterviewPhase =
  | "Clarifying Questions"
  | "Coding"
  | "Discussion";

export interface StreamDoneEvent {
  type: "done";
  content: string;
  hint_advanced?: boolean;
  mock_interview_phase?: MockInterviewPhase;
}

export interface StreamTokenEvent {
  type: "token";
  content: string;
}

export interface StreamErrorEvent {
  type: "error";
  message: string;
}

export type StreamEvent = StreamTokenEvent | StreamDoneEvent | StreamErrorEvent;
