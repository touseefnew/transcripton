import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  Menu,
  Mic,
  Plus,
  RotateCcw,
} from "lucide-react";
import type {
  FormatMode,
  RecordedClip,
  StudioSession,
  TranscriptTurn,
} from "./types/studio";
import { blobToBase64, formatDuration } from "./utils/audio";
import { AudioClipItem } from "./components/AudioClipItem";
import { CodeBlockTranscript } from "./components/CodeBlockTranscript";
import {
  RecorderComposer,
  type RecorderComposerHandle,
} from "./components/RecorderComposer";
import { StudioSidebar } from "./components/StudioSidebar";

const STORAGE_SESSIONS_KEY = "voice-script-studio-sessions-v1";
const STORAGE_THEME_KEY = "voice-script-studio-theme-v1";
const STORAGE_FORMAT_KEY = "voice-script-studio-format-v1";

function createEmptySession(): StudioSession {
  return {
    id: `session-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: "Untitled session",
    updatedAt: Date.now(),
    turns: [],
  };
}

function loadSavedSessions(): StudioSession[] {
  try {
    const raw = localStorage.getItem(STORAGE_SESSIONS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as StudioSession[];
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((s) => s && typeof s.id === "string" && Array.isArray(s.turns))
      .map((s) => ({
        ...s,
        turns: s.turns
          .filter((t) => t.status !== "processing")
          .map((t) => ({
            ...t,
            clips: t.clips.map((c) => ({ ...c, audioUrl: undefined })),
          })),
      }));
  } catch {
    return [];
  }
}

export default function App() {
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    try {
      const saved = localStorage.getItem(STORAGE_THEME_KEY);
      if (saved === "dark" || saved === "light") return saved;
    } catch {
      // ignore
    }
    return "light";
  });

  const [formatMode, setFormatMode] = useState<FormatMode>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_FORMAT_KEY);
      if (saved === "per-clip" || saved === "combined") return saved;
    } catch {
      // ignore
    }
    return "combined";
  });

  const [sessions, setSessions] = useState<StudioSession[]>(() => {
    const loaded = loadSavedSessions();
    if (loaded.length > 0) return loaded;
    return [createEmptySession()];
  });

  const [activeSessionId, setActiveSessionId] = useState<string>(() => {
    const loaded = loadSavedSessions();
    return loaded.length > 0 ? loaded[0].id : "";
  });

  // Ensure activeSessionId always points to a valid session
  useEffect(() => {
    if (!sessions.some((s) => s.id === activeSessionId)) {
      setActiveSessionId(sessions[0]?.id ?? "");
    }
  }, [sessions, activeSessionId]);

  const [queuedClips, setQueuedClips] = useState<RecordedClip[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

  // Store blob maps per turn id so retry works in-session without re-recording
  const turnBlobsRef = useRef<Map<string, RecordedClip[]>>(new Map());
  const composerRef = useRef<RecorderComposerHandle | null>(null);
  const bottomAnchorRef = useRef<HTMLDivElement | null>(null);

  // Sync dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === "dark") {
      root.classList.add("dark");
    } else {
      root.classList.remove("dark");
    }
    try {
      localStorage.setItem(STORAGE_THEME_KEY, theme);
    } catch {
      // ignore
    }
  }, [theme]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_FORMAT_KEY, formatMode);
    } catch {
      // ignore
    }
  }, [formatMode]);

  // Persist non-empty sessions to localStorage (strip volatile blob URLs)
  useEffect(() => {
    try {
      const persistable = sessions
        .filter((s) => s.turns.length > 0)
        .slice(0, 30)
        .map((s) => ({
          ...s,
          turns: s.turns
            .filter((t) => t.status !== "processing")
            .map((t) => ({
              ...t,
              clips: t.clips.map(({ audioUrl: _omit, ...rest }) => rest),
            })),
        }));
      localStorage.setItem(STORAGE_SESSIONS_KEY, JSON.stringify(persistable));
    } catch {
      // ignore storage quota errors
    }
  }, [sessions]);

  const activeSession = useMemo(
    () => sessions.find((s) => s.id === activeSessionId) ?? sessions[0],
    [sessions, activeSessionId]
  );

  // Scroll smoothly when new turns appear
  const turnCount = activeSession?.turns.length ?? 0;
  useEffect(() => {
    if (turnCount > 0) {
      bottomAnchorRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
  }, [turnCount]);

  const handleAddClip = useCallback((clip: RecordedClip) => {
    setQueuedClips((prev) => [...prev, clip]);
  }, []);

  const handleRemoveClip = useCallback((id: string) => {
    setQueuedClips((prev) => {
      const target = prev.find((c) => c.id === id);
      if (target?.audioUrl) {
        URL.revokeObjectURL(target.audioUrl);
      }
      return prev.filter((c) => c.id !== id);
    });
  }, []);

  const handleClearClips = useCallback(() => {
    setQueuedClips((prev) => {
      prev.forEach((c) => {
        if (c.audioUrl) URL.revokeObjectURL(c.audioUrl);
      });
      return [];
    });
  }, []);

  const handleNewSession = useCallback(() => {
    if (activeSession && activeSession.turns.length === 0) {
      handleClearClips();
      return;
    }
    const next = createEmptySession();
    setSessions((prev) => [next, ...prev]);
    setActiveSessionId(next.id);
    handleClearClips();
  }, [activeSession, handleClearClips]);

  const handleDeleteSession = useCallback(
    (id: string) => {
      setSessions((prev) => {
        const remaining = prev.filter((s) => s.id !== id);
        if (remaining.length === 0) {
          const fresh = createEmptySession();
          setActiveSessionId(fresh.id);
          return [fresh];
        }
        if (id === activeSessionId) {
          setActiveSessionId(remaining[0].id);
        }
        return remaining;
      });
    },
    [activeSessionId]
  );

  const executeTranscription = useCallback(
    async (
      sessionId: string,
      turnId: string,
      clipsToSend: RecordedClip[],
      mode: FormatMode
    ) => {
      setIsProcessing(true);
      try {
        const encodedClips = await Promise.all(
          clipsToSend.map(async (clip) => {
            if (!clip.blob) {
              throw new Error(`Audio data for "${clip.name}" is no longer available.`);
            }
            const base64 = await blobToBase64(clip.blob);
            return {
              id: clip.id,
              name: clip.name,
              mimeType: clip.mimeType,
              base64,
              durationSec: clip.durationSec,
            };
          })
        );

        const response = await fetch("/api/transcribe", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clips: encodedClips,
            formatMode: mode,
          }),
        });

        const payload = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(
            typeof payload?.error === "string"
              ? payload.error
              : `Transcription failed (HTTP ${response.status}).`
          );
        }

        const englishTranscript = String(payload.englishTranscript || "").trim();
        const sessionTitle = String(payload.sessionTitle || "").trim();
        const originalUrduClips = Array.isArray(payload.originalUrduClips)
          ? payload.originalUrduClips
          : [];

        setSessions((prev) =>
          prev.map((session) => {
            if (session.id !== sessionId) return session;
            const shouldUpdateTitle =
              session.title === "Untitled session" && sessionTitle.length > 0;
            return {
              ...session,
              title: shouldUpdateTitle ? sessionTitle : session.title,
              updatedAt: Date.now(),
              turns: session.turns.map((turn) =>
                turn.id === turnId
                  ? {
                      ...turn,
                      status: "done",
                      englishTranscript,
                      originalUrduClips,
                      errorMessage: undefined,
                    }
                  : turn
              ),
            };
          })
        );
      } catch (err: unknown) {
        const message =
          err instanceof Error
            ? err.message
            : "Something went wrong while transcribing your audio.";
        setSessions((prev) =>
          prev.map((session) => {
            if (session.id !== sessionId) return session;
            return {
              ...session,
              updatedAt: Date.now(),
              turns: session.turns.map((turn) =>
                turn.id === turnId
                  ? {
                      ...turn,
                      status: "error",
                      errorMessage: message,
                    }
                  : turn
              ),
            };
          })
        );
      } finally {
        setIsProcessing(false);
      }
    },
    []
  );

  const handleRun = useCallback(() => {
    if (queuedClips.length === 0 || isProcessing || !activeSession) return;

    const clipsSnapshot = [...queuedClips];
    const turnId = `turn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    turnBlobsRef.current.set(turnId, clipsSnapshot);

    const newTurn: TranscriptTurn = {
      id: turnId,
      createdAt: Date.now(),
      clips: clipsSnapshot.map((c) => ({
        id: c.id,
        name: c.name,
        durationSec: c.durationSec,
        mimeType: c.mimeType,
        audioUrl: c.audioUrl,
      })),
      formatMode,
      status: "processing",
    };

    const sessionId = activeSession.id;
    setSessions((prev) =>
      prev.map((s) =>
        s.id === sessionId
          ? { ...s, updatedAt: Date.now(), turns: [...s.turns, newTurn] }
          : s
      )
    );

    // Clear composer queue without revoking audioUrls (they now belong to the submitted turn!)
    setQueuedClips([]);

    void executeTranscription(sessionId, turnId, clipsSnapshot, formatMode);
  }, [activeSession, executeTranscription, formatMode, isProcessing, queuedClips]);

  const handleRetryTurn = useCallback(
    (turn: TranscriptTurn) => {
      if (!activeSession || isProcessing) return;
      const savedClips = turnBlobsRef.current.get(turn.id);
      if (!savedClips || savedClips.length === 0) return;

      const sessionId = activeSession.id;
      setSessions((prev) =>
        prev.map((s) =>
          s.id === sessionId
            ? {
                ...s,
                turns: s.turns.map((t) =>
                  t.id === turn.id
                    ? { ...t, status: "processing", errorMessage: undefined }
                    : t
                ),
              }
            : s
        )
      );

      void executeTranscription(sessionId, turn.id, savedClips, turn.formatMode);
    },
    [activeSession, executeTranscription, isProcessing]
  );

  const visibleHistorySessions = useMemo(
    () => sessions.filter((s) => s.turns.length > 0 || s.id === activeSessionId),
    [sessions, activeSessionId]
  );

  return (
    <div className="flex h-full w-full overflow-hidden bg-white dark:bg-[#131314] text-zinc-900 dark:text-[#E8EAED]">
      {/* Sidebar */}
      <StudioSidebar
        sessions={visibleHistorySessions}
        activeSessionId={activeSession?.id ?? ""}
        onSelectSession={(id) => setActiveSessionId(id)}
        onNewSession={handleNewSession}
        onDeleteSession={handleDeleteSession}
        formatMode={formatMode}
        onChangeFormatMode={setFormatMode}
        theme={theme}
        onChangeTheme={setTheme}
        mobileOpen={mobileSidebarOpen}
        onCloseMobile={() => setMobileSidebarOpen(false)}
      />

      {/* Main studio column */}
      <div className="flex min-w-0 flex-1 flex-col h-full">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary action on right */}
        <header className="flex h-14 shrink-0 items-center justify-between gap-6 border-b border-zinc-200 dark:border-[#2D2F31] px-4 sm:px-6 bg-white dark:bg-[#131314]">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileSidebarOpen(true)}
              aria-label="Open sessions sidebar"
              className="flex lg:hidden h-9 w-9 shrink-0 items-center justify-center rounded-lg text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-[#282A2C] cursor-pointer"
            >
              <Menu className="h-5 w-5" />
            </button>

            <div className="flex items-center gap-2 min-w-0">
              <span className="font-display text-sm font-semibold tracking-tight text-zinc-900 dark:text-white whitespace-nowrap shrink-0">
                Voice Script Studio
              </span>
              {activeSession && activeSession.turns.length > 0 && (
                <>
                  <span className="text-zinc-300 dark:text-zinc-600 shrink-0" aria-hidden="true">
                    /
                  </span>
                  <span className="truncate text-sm text-zinc-500 dark:text-zinc-400">
                    {activeSession.title}
                  </span>
                </>
              )}
            </div>
          </div>

          <button
            type="button"
            onClick={handleNewSession}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 dark:border-[#323437] bg-white dark:bg-[#1E1F20] px-3.5 py-2 text-xs font-medium text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-[#282A2C] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
          >
            <Plus className="h-3.5 w-3.5" />
            <span>New session</span>
          </button>
        </header>

        {/* Scrollable Workspace Viewport */}
        <main className="flex-1 overflow-y-auto">
          {!activeSession || activeSession.turns.length === 0 ? (
            /* Empty State */
            <div className="flex min-h-full flex-col items-center justify-center px-6 py-12 text-center">
              <div className="max-w-lg space-y-5">
                <h1 className="font-display text-2xl sm:text-3xl font-semibold tracking-tight text-zinc-900 dark:text-white [text-wrap:balance]">
                  Speak in Urdu, get clean English transcripts
                </h1>
                <p className="text-sm sm:text-[15px] leading-relaxed text-zinc-500 dark:text-zinc-400">
                  Record one clip or stop and stack multiple recordings together, then press Run to receive the full English transcript inside a copy-ready code block.
                </p>

                <div className="pt-2">
                  <button
                    type="button"
                    onClick={() => composerRef.current?.startRecording()}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#1A73E8] px-5 py-3 text-sm font-medium text-white hover:bg-[#1557B0] transition-colors whitespace-nowrap cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                  >
                    <Mic className="h-4 w-4" />
                    <span>Start recording</span>
                  </button>
                </div>

                <div className="pt-4 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-xs text-zinc-400 dark:text-zinc-500">
                  <span>1. Start &amp; stop recording</span>
                  <span aria-hidden="true">·</span>
                  <span>2. Stack 2 or 3+ clips together</span>
                  <span aria-hidden="true">·</span>
                  <span>3. Click Run for English code block</span>
                </div>
              </div>
            </div>
          ) : (
            /* Turns Stream */
            <div className="mx-auto w-full max-w-4xl px-4 sm:px-6 py-6 sm:py-8 space-y-8">
              {activeSession.turns.map((turn, turnIndex) => {
                const totalDur = turn.clips.reduce(
                  (acc, c) => acc + (c.durationSec || 0),
                  0
                );
                const canRetry = turnBlobsRef.current.has(turn.id);

                return (
                  <section
                    key={turn.id}
                    className={`space-y-5 ${
                      turnIndex > 0
                        ? "border-t border-zinc-200/80 dark:border-[#2D2F31] pt-8"
                        : ""
                    }`}
                  >
                    {/* User Turn: Recorded Audio Clips */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          You
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {turn.clips.length}{" "}
                          {turn.clips.length === 1 ? "recording" : "recordings"}
                        </span>
                        {totalDur > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>{formatDuration(totalDur)}</span>
                          </>
                        )}
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                        {turn.clips.map((clip) => (
                          <AudioClipItem
                            key={clip.id}
                            name={clip.name}
                            durationSec={clip.durationSec}
                            audioUrl={clip.audioUrl}
                          />
                        ))}
                      </div>
                    </div>

                    {/* Transcript Output Turn */}
                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
                        <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                          English Transcript
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>Urdu to English</span>
                        {turn.clips.length > 1 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span>
                              {turn.formatMode === "per-clip" ? "Per clip" : "Combined"}
                            </span>
                          </>
                        )}
                      </div>

                      {turn.status === "processing" && (
                        <div className="rounded-xl border border-zinc-200 dark:border-[#2D2F31] bg-[#F8F9FA] dark:bg-[#191A1C] p-5 space-y-3">
                          <div className="flex items-center gap-2 text-xs font-medium text-zinc-600 dark:text-zinc-300">
                            <span>
                              Transcribing{" "}
                              {turn.clips.length === 1
                                ? "recording"
                                : `${turn.clips.length} recordings`}{" "}
                              and translating Urdu to English...
                            </span>
                          </div>
                          <div className="space-y-2 animate-pulse">
                            <div className="h-3.5 w-11/12 rounded bg-zinc-200 dark:bg-[#2D2F31]" />
                            <div className="h-3.5 w-4/5 rounded bg-zinc-200 dark:bg-[#2D2F31]" />
                            <div className="h-3.5 w-3/5 rounded bg-zinc-200 dark:bg-[#2D2F31]" />
                          </div>
                        </div>
                      )}

                      {turn.status === "done" && turn.englishTranscript && (
                        <CodeBlockTranscript
                          transcript={turn.englishTranscript}
                          originalUrduClips={turn.originalUrduClips}
                        />
                      )}

                      {turn.status === "error" && (
                        <div
                          role="alert"
                          className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/25 px-4 py-3.5 text-sm text-red-700 dark:text-red-300"
                        >
                          <div className="flex items-start gap-2.5 min-w-0 flex-1">
                            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                            <span>
                              {turn.errorMessage || "Failed to transcribe audio."}
                            </span>
                          </div>

                          {canRetry && (
                            <button
                              type="button"
                              onClick={() => handleRetryTurn(turn)}
                              disabled={isProcessing}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-red-300 dark:border-red-800 bg-white dark:bg-[#1E1F20] px-3 py-1.5 text-xs font-medium text-red-700 dark:text-red-300 hover:bg-red-50 dark:hover:bg-red-950/40 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                            >
                              <RotateCcw className="h-3.5 w-3.5" />
                              <span>Retry</span>
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </section>
                );
              })}
              <div ref={bottomAnchorRef} />
            </div>
          )}
        </main>

        {/* Sticky Bottom Google AI Studio-Style Recorder Composer */}
        <div className="shrink-0 bg-gradient-to-t from-white via-white to-white/80 dark:from-[#131314] dark:via-[#131314] dark:to-[#131314]/80">
          <RecorderComposer
            ref={composerRef}
            clips={queuedClips}
            onAddClip={handleAddClip}
            onRemoveClip={handleRemoveClip}
            onClearClips={handleClearClips}
            onRun={handleRun}
            isProcessing={isProcessing}
          />
        </div>
      </div>
    </div>
  );
}
