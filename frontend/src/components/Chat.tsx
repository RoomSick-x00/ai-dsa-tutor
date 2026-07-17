"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  checkBackendHealth,
  classifyIntent,
  getPatternTag,
  stripTutorTags,
  stripFirstLine,
} from "@/lib/api";
import type { ChatMessage, MockInterviewPhase, TutorMode } from "@/lib/types";
import HintLadderControls from "./HintLadderControls";
import styles from "./Chat.module.css";

const MODE_OPTIONS: { value: TutorMode; label: string; description: string }[] = [
  { value: "hint_ladder", label: "Hint Ladder", description: "Paste a problem and get escalating hints without the answer too soon." },
  { value: "brainstorming", label: "Brainstorming", description: "Explore several possible directions and their tradeoffs." },
  { value: "pattern_recognition", label: "Pattern Recognition", description: "Paste a problem to identify the fitting DSA pattern." },
  { value: "complexity_checker", label: "Complexity Checker", description: "Paste your code for a time and space complexity review." },
  { value: "mock_interview", label: "Mock Interview", description: "Practice explaining and defending an approach in interview phases." },
];

const MODE_ICONS: Record<TutorMode, React.ReactNode> = {
  hint_ladder: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M15 14c.2-1 .7-1.7 1.5-2.5 1-.9 1.5-2.2 1.5-3.5A5 5 0 0 0 8 8c0 1 .3 2.2 1.5 3.5.7.7 1.3 1.5 1.5 2.5"/><path d="M9 18h6"/><path d="M10 22h4"/></svg>
  ),
  brainstorming: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96-.44 2.5 2.5 0 0 1 0-3.12 3 3 0 0 1 0-4.88 2.5 2.5 0 0 1 0-3.12A2.5 2.5 0 0 1 9.5 2Z"/><path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96-.44 2.5 2.5 0 0 0 0-3.12 3 3 0 0 0 0-4.88 2.5 2.5 0 0 0 0-3.12A2.5 2.5 0 0 0 14.5 2Z"/></svg>
  ),
  pattern_recognition: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2H2v10l9.29 9.29c.94.94 2.48.94 3.42 0l5.58-5.58c.94-.94.94-2.48 0-3.42L12 2Z"/><path d="M7 7h.01"/></svg>
  ),
  complexity_checker: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/></svg>
  ),
  mock_interview: (
    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
  ),
};

const SITUATION_CARDS: { mode: TutorMode; title: string; description: string }[] = [
  { mode: "hint_ladder", title: "Stuck on a problem", description: "Get escalating hints without seeing the answer too soon." },
  { mode: "brainstorming", title: "Not sure where to start", description: "Think through possible directions and tradeoffs together." },
  { mode: "complexity_checker", title: "Review my solution", description: "Check the time and space complexity of your code." },
  { mode: "mock_interview", title: "Practice interview", description: "Simulate a focused DSA technical interview." },
];

const INTERVIEW_PHASE_SECONDS = 15 * 60;

function uid() {
  return Math.random().toString(36).slice(2, 10);
}

function formatRemaining(seconds: number) {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const remainder = (seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remainder}`;
}

function normalizeTutorText(text: string) {
  return text.replace(/\$/g, "").replace(/\\/g, "").trim();
}

export default function Chat() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [isClassifying, setIsClassifying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [selectedMode, setSelectedMode] = useState<TutorMode | null>(null);
  const [detectedMode, setDetectedMode] = useState<TutorMode | null>(null);
  const [modeSuggestion, setModeSuggestion] = useState<TutorMode | null>(null);
  const [isModeMenuOpen, setIsModeMenuOpen] = useState(false);
  const [hintLevel, setHintLevel] = useState(1);
  const [firstHintDelivered, setFirstHintDelivered] = useState(false);
  const [mockInterview, setMockInterview] = useState<{ phase: MockInterviewPhase; startedAt: number }>({
    phase: "Clarifying Questions",
    startedAt: Date.now(),
  });
  const [secondsRemaining, setSecondsRemaining] = useState(INTERVIEW_PHASE_SECONDS);
  const [error, setError] = useState<string | null>(null);
  const [, setBackendStatus] = useState<string | null>(null);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const modeMenuRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const timedOutPhaseRef = useRef<MockInterviewPhase | null>(null);
  const mode = selectedMode ?? "hint_ladder";
  const modeInfo = MODE_OPTIONS.find((option) => option.value === mode)!;
  const isComplexityChecker = hasStarted && mode === "complexity_checker";
  const isMockInterview = hasStarted && mode === "mock_interview";
  const isLanding = !hasStarted;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    checkBackendHealth().then(({ ok, detail }) => {
      setBackendStatus(detail);
      if (!ok) {
        console.error("[Chat] Backend health check failed:", detail);
        setError(detail);
      }
    });
  }, []);

  useEffect(() => {
    if (!isMockInterview) return;
    const updateTimer = () => {
      const elapsed = Math.floor((Date.now() - mockInterview.startedAt) / 1000);
      setSecondsRemaining(Math.max(0, INTERVIEW_PHASE_SECONDS - elapsed));
    };
    updateTimer();
    const timer = window.setInterval(updateTimer, 1000);
    return () => window.clearInterval(timer);
  }, [isMockInterview, mockInterview.startedAt]);

  useEffect(() => {
    if (!isModeMenuOpen) return;
    const handlePointerDown = (event: MouseEvent) => {
      if (modeMenuRef.current && !modeMenuRef.current.contains(event.target as Node)) {
        setIsModeMenuOpen(false);
      }
    };
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [isModeMenuOpen]);

  // Dynamic textarea height
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 200)}px`;
    }
  }, [input]);

  const sendMessage = useCallback(
    async (text: string, action?: "next_hint" | "phase_timeout", modeOverride?: TutorMode) => {
      // Mock streaming for UI development if backend is not connected
      const activeMode = modeOverride ?? selectedMode;
      const trimmed = text.trim();
      const isSystemAction = action === "next_hint" || action === "phase_timeout";
      if (!activeMode || isStreaming || (!isSystemAction && !trimmed)) return;

      setError(null);
      const assistantId = uid();
      const history = messages.map((message) => ({
        role: message.role,
        content: stripTutorTags(message.content),
      }));

      if (!isSystemAction) {
        setMessages((previous) => [
          ...previous,
          { id: uid(), role: "user", content: trimmed },
          { id: assistantId, role: "assistant", content: "" },
        ]);
        setInput("");
      } else {
        setMessages((previous) => [...previous, { id: assistantId, role: "assistant", content: "" }]);
      }
      setIsStreaming(true);

      abortRef.current?.abort();
      abortRef.current = new AbortController();
      let streamed = "";

      // We dynamically import the actual streamChat inside to bypass circular refs if any, but since it's just from @/lib/api it's fine.
      // Assuming api.ts streamChat works as before.
      const { streamChat } = await import('@/lib/api');

      try {
        await streamChat(
          {
            mode: activeMode,
            message: isSystemAction ? "" : trimmed,
            history,
            hint_level: hintLevel,
            action: action === "next_hint" ? action : undefined,
            mock_interview_phase: activeMode === "mock_interview" ? mockInterview.phase : undefined,
            mock_interview_timer_expired: action === "phase_timeout",
          },
          (token) => {
            streamed += token;
            const visibleContent = normalizeTutorText(streamed);
            setMessages((previous) => previous.map((message) => (
              message.id === assistantId ? { ...message, content: visibleContent } : message
            )));
          },
          (done) => {
            const finalContent = normalizeTutorText(done.content || streamed);
            setMessages((previous) => previous.map((message) => (
              message.id === assistantId ? { ...message, content: finalContent } : message
            )));
            if (action === "next_hint" && done.hint_advanced === true) {
              setHintLevel((level) => Math.min(level + 1, 4));
            }
            if (activeMode === "hint_ladder" && action !== "next_hint" && finalContent) {
              setFirstHintDelivered(true);
            }
            if (done.mock_interview_phase) {
              setMockInterview({ phase: done.mock_interview_phase, startedAt: Date.now() });
              timedOutPhaseRef.current = null;
            }
          },
          abortRef.current.signal,
        );
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const message = err instanceof Error ? err.message : "Something went wrong";
          console.error("[Chat] sendMessage failed:", err);
          setError(message);
          setMessages((previous) => previous.filter((item) => item.id !== assistantId));
        }
      } finally {
        setIsStreaming(false);
      }
    },
    [hintLevel, isStreaming, messages, mockInterview.phase, selectedMode],
  );

  const selectSituation = (nextMode: TutorMode) => {
    setSelectedMode(nextMode);
    setError(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const changeMode = (nextMode: TutorMode) => {
    if (nextMode === selectedMode || isStreaming) return;
    
    // Bug 2 fix: Reset conversation state completely on mode switch
    setSelectedMode(nextMode);
    setMessages([]);
    setHasStarted(false);
    setDetectedMode(null);
    setModeSuggestion(null);
    setError(null);
    setIsModeMenuOpen(false);
    
    if (nextMode === "hint_ladder") {
      setHintLevel(1);
      setFirstHintDelivered(false);
    }
    if (nextMode === "mock_interview") {
      setMockInterview({ phase: "Clarifying Questions", startedAt: Date.now() });
      timedOutPhaseRef.current = null;
    }
  };

  useEffect(() => {
    if (
      !isMockInterview ||
      isStreaming ||
      secondsRemaining > 0 ||
      mockInterview.phase === "Discussion" ||
      timedOutPhaseRef.current === mockInterview.phase
    ) return;

    timedOutPhaseRef.current = mockInterview.phase;
    void sendMessage("", "phase_timeout");
  }, [isMockInterview, isStreaming, mockInterview.phase, secondsRemaining, sendMessage]);

  const handleSubmit = async (event: React.FormEvent | React.KeyboardEvent) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || isStreaming || isClassifying) return;

    if (hasStarted) {
      await sendMessage(text);
      return;
    }

    if (selectedMode) {
      setHasStarted(true);
      await sendMessage(text, undefined, selectedMode);
      return;
    }

    setIsClassifying(true);
    setError(null);
    try {
      const detected = await classifyIntent(text);
      setDetectedMode(detected);
      setModeSuggestion(detected);
      setHasStarted(true);
      await sendMessage(text, undefined, detected);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not detect a tutoring mode";
      setError(message);
    } finally {
      setIsClassifying(false);
    }
  };

  const inputPlaceholder = isLanding
    ? "YOUR DSA THINKING PARTNER — Choose a situation, or paste anything and I'll route you..."
    : isComplexityChecker
      ? "Paste your solution code here..."
      : "Message AI DSA Tutor...";

  return (
    <div className={styles.layout}>
      {/* LEFT SIDEBAR (Claude-style) */}
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHeader}>
          <div className={styles.appLogo}>
            <h2>AI DSA Tutor</h2>
          </div>
          <button className={styles.newChatBtn} onClick={() => window.location.reload()} title="New Chat">
             <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 5v14M5 12h14"/></svg>
          </button>
        </div>
        <div className={styles.sidebarContent}>
          {/* Real chat history will be populated here later */}
        </div>
      </aside>

      <main className={styles.main}>
        {isLanding ? (
          <section className={styles.landing} aria-labelledby="landing-title">
            <h1 id="landing-title" className={styles.landingTitle}>How can I help today?</h1>
            <div className={styles.situationGrid}>
              {SITUATION_CARDS.map((card) => {
                const isSelected = selectedMode === card.mode;
                const cardAccentClass = styles[`card_${card.mode}`];
                return (
                  <button
                    key={card.mode}
                    type="button"
                    className={`${styles.situationCard} ${cardAccentClass} ${isSelected ? styles[`card_${card.mode}Selected`] : ""}`}
                    onClick={() => selectSituation(card.mode)}
                    aria-pressed={isSelected}
                  >
                    <div className={styles.situationCardHeader}>
                      <span className={`${styles.situationCardIcon} ${styles[`cardIcon_${card.mode}`]}`}>
                        {MODE_ICONS[card.mode]}
                      </span>
                      <span className={styles.situationTitle}>{card.title}</span>
                    </div>
                    <span className={styles.situationDescription}>{card.description}</span>
                  </button>
                );
              })}
            </div>
          </section>
        ) : (
          <>
            {detectedMode && !isLanding && (
              <div className={styles.detectedNote}>
                {modeSuggestion && modeSuggestion !== mode
                  ? `suggesting: ${MODE_OPTIONS.find((option) => option.value === modeSuggestion)?.label.toLowerCase()} — switch?`
                  : `detected: ${MODE_OPTIONS.find((option) => option.value === detectedMode)?.label.toLowerCase()} mode`}
              </div>
            )}
            {isMockInterview && (
              <div className={styles.phaseBar}>
                <span>Phase: <strong>{mockInterview.phase}</strong></span>
                <span className={styles.countdown}>{formatRemaining(secondsRemaining)}</span>
              </div>
            )}
            <div className={styles.messageList}>
              {messages.map((message) => {
                const isAssistant = message.role === "assistant";
                let badgeContent = null;
                let textContent = message.content;
                
                // Bug 1 fix logic applied here:
                if (mode === "pattern_recognition" && isAssistant) {
                  const tag = getPatternTag(textContent);
                  if (tag) {
                    badgeContent = tag;
                    textContent = stripFirstLine(textContent);
                  }
                }

                return (
                  <div key={message.id} className={`${styles.message} ${isAssistant ? styles.assistantMsg : styles.userMsg}`}>
                    {isAssistant && (
                      <div className={`${styles.avatar} ${styles[`avatar_${mode}`]}`}>
                        AI
                      </div>
                    )}
                    <div className={styles.messageBody}>
                      {badgeContent && <span className={styles.patternBadge}>{badgeContent}</span>}
                      <div className={styles.messageContent}>
                        {isAssistant ? (
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {stripTutorTags(textContent)}
                          </ReactMarkdown>
                        ) : (
                          stripTutorTags(textContent)
                        )}
                        {isStreaming && isAssistant && !message.content ? (
                          <span className={styles.thinkingState}>tutor is thinking<span className={styles.thinkingDots}><span /><span /><span /></span></span>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
              <div ref={messagesEndRef} />
            </div>
          </>
        )}

        <div className={styles.inputArea}>
          {error && <div className={styles.error}>{error}</div>}
          {!isLanding && mode === "hint_ladder" && firstHintDelivered && <HintLadderControls hintLevel={hintLevel} isStreaming={isStreaming} onNextHint={() => sendMessage("", "next_hint")} />}
          
          <div className={styles.inputContainer}>
            <textarea
              ref={textareaRef}
              className={`${styles.textarea} ${!isLanding && isComplexityChecker ? styles.codeTextarea : ""}`}
              value={input}
              onChange={(event) => setInput(event.target.value)}
              onKeyDown={(event) => {
                if ((!isComplexityChecker || isLanding) && event.key === "Enter" && !event.shiftKey) { 
                  event.preventDefault(); 
                  void handleSubmit(event); 
                }
              }}
              placeholder={inputPlaceholder}
              disabled={isStreaming || isClassifying}
              rows={1}
            />
            
            <div className={styles.inputToolbar}>
              <div className={styles.modeSelectorWrapper} ref={modeMenuRef}>
                <button
                  type="button"
                  className={styles.modeChip}
                  onClick={() => setIsModeMenuOpen(!isModeMenuOpen)}
                  disabled={isStreaming}
                >
                  <span className={styles.modeChipIcon}>{MODE_ICONS[mode]}</span>
                  <span className={styles.modeChipLabel}>{modeInfo.label}</span>
                  <span className={styles.modeChevron}>▾</span>
                </button>
                
                {isModeMenuOpen && (
                  <div className={styles.modeMenu}>
                    {MODE_OPTIONS.map((option) => {
                      const isActive = option.value === mode;
                      return (
                        <button
                          key={option.value}
                          type="button"
                          className={`${styles.modeMenuItem} ${isActive ? styles.modeMenuItemActive : ""}`}
                          onClick={() => changeMode(option.value)}
                        >
                          <span className={styles.modeMenuLabel}>
                            {MODE_ICONS[option.value]} {option.label}
                          </span>
                          <span className={styles.modeMenuDescription}>{option.description}</span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
              
              <button
                type="button"
                className={styles.sendBtn}
                disabled={isStreaming || isClassifying || !input.trim()}
                onClick={(e) => handleSubmit(e)}
              >
                {isClassifying ? "Routing..." : !isLanding && isComplexityChecker ? "Analyze →" : "Send"}
              </button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
