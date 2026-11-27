import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  AlertCircle,
  CornerDownLeft,
  Loader2,
  Mic,
  Plus,
  Square,
  Trash2,
  Upload,
} from "lucide-react";
import type { RecordedClip } from "../types/studio";
import {
  cleanMimeType,
  formatDuration,
  formatTimerPadded,
  getAudioBlobDuration,
  getSupportedAudioMimeType,
} from "../utils/audio";
import { AudioClipItem } from "./AudioClipItem";
import { LiveWaveform } from "./LiveWaveform";

export interface RecorderComposerHandle {
  startRecording: () => void;
}

interface RecorderComposerProps {
  clips: RecordedClip[];
  onAddClip: (clip: RecordedClip) => void;
  onRemoveClip: (id: string) => void;
  onClearClips: () => void;
  onRun: () => void;
  isProcessing: boolean;
}

export const RecorderComposer = forwardRef<
  RecorderComposerHandle,
  RecorderComposerProps
>(function RecorderComposer(
  { clips, onAddClip, onRemoveClip, onClearClips, onRun, isProcessing },
  ref
) {
  const [isRecording, setIsRecording] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);
  const [micError, setMicError] = useState<string | null>(null);
  const [activeStream, setActiveStream] = useState<MediaStream | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const startTimeRef = useRef<number>(0);
  const timerIntervalRef = useRef<number | null>(null);
  const cancelledRef = useRef<boolean>(false);
  const clipCounterRef = useRef<number>(clips.length);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (clips.length === 0) {
      clipCounterRef.current = 0;
    }
  }, [clips.length]);

  const stopTracks = useCallback((stream: MediaStream | null) => {
    if (!stream) return;
    stream.getTracks().forEach((track) => track.stop());
  }, []);

  const clearTimer = useCallback(() => {
    if (timerIntervalRef.current !== null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const startRecording = useCallback(async () => {
    if (isRecording || isProcessing) return;
    setMicError(null);

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      setMicError(
        "Audio recording is not supported in this browser. You can upload an audio file instead."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const preferredMime = getSupportedAudioMimeType();
      const recorder = preferredMime
        ? new MediaRecorder(stream, { mimeType: preferredMime })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      cancelledRef.current = false;
      mediaRecorderRef.current = recorder;
      setActiveStream(stream);

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = async () => {
        clearTimer();
        stopTracks(stream);
        setActiveStream(null);
        setIsRecording(false);

        const elapsed = Math.max(
          0.5,
          (Date.now() - startTimeRef.current) / 1000
        );
        setElapsedSec(0);

        if (cancelledRef.current) {
          chunksRef.current = [];
          return;
        }

        const rawMime = recorder.mimeType || preferredMime || "audio/webm";
        const blob = new Blob(chunksRef.current, { type: rawMime });
        chunksRef.current = [];

        if (blob.size < 100) {
          setMicError("Recording was too short. Please try speaking a little longer.");
          return;
        }

        clipCounterRef.current += 1;
        const clipNumber = clipCounterRef.current;
        const audioUrl = URL.createObjectURL(blob);

        onAddClip({
          id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          name: `Recording ${clipNumber}`,
          durationSec: Math.round(elapsed),
          mimeType: cleanMimeType(rawMime),
          blob,
          audioUrl,
          sizeBytes: blob.size,
        });
      };

      recorder.onerror = () => {
        clearTimer();
        stopTracks(stream);
        setActiveStream(null);
        setIsRecording(false);
        setElapsedSec(0);
        setMicError("Recording encountered an error. Please try again.");
      };

      startTimeRef.current = Date.now();
      setElapsedSec(0);
      setIsRecording(true);
      recorder.start(250);

      timerIntervalRef.current = window.setInterval(() => {
        setElapsedSec(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 250);
    } catch (err: unknown) {
      const name = err instanceof Error ? err.name : "";
      if (name === "NotAllowedError" || name === "PermissionDeniedError") {
        setMicError(
          "Microphone access was blocked. Allow microphone permission in your browser address bar, then try again."
        );
      } else if (name === "NotFoundError") {
        setMicError("No microphone was detected on this device.");
      } else {
        setMicError("Could not start recording. Please check your microphone and try again.");
      }
    }
  }, [clearTimer, isProcessing, isRecording, onAddClip, stopTracks]);

  const stopRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      cancelledRef.current = false;
      recorder.stop();
    }
  }, []);

  const cancelRecording = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      cancelledRef.current = true;
      recorder.stop();
    }
  }, []);

  useImperativeHandle(
    ref,
    () => ({
      startRecording,
    }),
    [startRecording]
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimer();
      const recorder = mediaRecorderRef.current;
      if (recorder && recorder.state !== "inactive") {
        cancelledRef.current = true;
        recorder.stop();
      }
    };
  }, [clearTimer]);

  // Ctrl+Enter / Cmd+Enter to Run
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        if (clips.length > 0 && !isRecording && !isProcessing) {
          e.preventDefault();
          onRun();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clips.length, isProcessing, isRecording, onRun]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;

    setMicError(null);
    for (const file of files) {
      if (!file.type.startsWith("audio/")) {
        setMicError(`"${file.name}" is not a supported audio file.`);
        continue;
      }
      const durationSec = Math.round(await getAudioBlobDuration(file));
      const audioUrl = URL.createObjectURL(file);
      clipCounterRef.current += 1;

      onAddClip({
        id: `clip-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        name: file.name.replace(/\.[^/.]+$/, "") || `Recording ${clipCounterRef.current}`,
        durationSec,
        mimeType: cleanMimeType(file.type),
        blob: file,
        audioUrl,
        sizeBytes: file.size,
      });
    }
  };

  const totalDurationSec = clips.reduce((acc, c) => acc + (c.durationSec || 0), 0);
  const canRun = clips.length > 0 && !isRecording && !isProcessing;

  return (
    <div className="w-full max-w-4xl mx-auto px-4 sm:px-6 pb-4 sm:pb-6 pt-2">
      {micError && (
        <div
          role="alert"
          className="mb-3 flex items-start gap-2.5 rounded-xl border border-red-200 dark:border-red-900/60 bg-red-50 dark:bg-red-950/30 px-3.5 py-2.5 text-xs text-red-700 dark:text-red-300"
        >
          <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
          <span className="leading-relaxed">{micError}</span>
        </div>
      )}

      <div
        className={`rounded-2xl border transition-colors bg-white dark:bg-[#1E1F20] ${
          isRecording
            ? "border-red-400 dark:border-red-500/70"
            : "border-zinc-200 dark:border-[#323437]"
        }`}
      >
        {/* Queued recordings tray */}
        {clips.length > 0 && (
          <div className="border-b border-zinc-200/80 dark:border-[#2D2F31] px-4 pt-3.5 pb-3">
            <div className="mb-2.5 flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400 tabular-nums">
                <span className="font-medium text-zinc-700 dark:text-zinc-300">
                  {clips.length} {clips.length === 1 ? "recording" : "recordings"} queued
                </span>
                <span aria-hidden="true">·</span>
                <span>{formatDuration(totalDurationSec)} total</span>
              </div>

              {clips.length > 1 && !isProcessing && (
                <button
                  type="button"
                  onClick={onClearClips}
                  className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-zinc-500 hover:text-red-600 hover:bg-zinc-100 dark:text-zinc-400 dark:hover:text-red-400 dark:hover:bg-[#282A2C] transition-colors whitespace-nowrap cursor-pointer"
                >
                  <Trash2 className="h-3 w-3" />
                  <span>Clear all</span>
                </button>
              )}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {clips.map((clip) => (
                <AudioClipItem
                  key={clip.id}
                  name={clip.name}
                  durationSec={clip.durationSec}
                  audioUrl={clip.audioUrl}
                  onRemove={isProcessing ? undefined : () => onRemoveClip(clip.id)}
                  compact
                />
              ))}
            </div>
          </div>
        )}

        {/* Active live recording strip */}
        {isRecording && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-200/80 dark:border-[#2D2F31] bg-red-50/60 dark:bg-red-950/20 px-4 py-3">
            <div className="flex items-center gap-3 min-w-0">
              <span
                aria-hidden="true"
                className="h-2.5 w-2.5 shrink-0 rounded-full bg-red-600 animate-pulse"
              />
              <span className="text-xs font-semibold text-red-700 dark:text-red-400 whitespace-nowrap">
                Recording {clips.length + 1}
              </span>
              <span className="font-mono text-sm font-medium tabular-nums text-zinc-900 dark:text-zinc-100 whitespace-nowrap">
                {formatTimerPadded(elapsedSec)}
              </span>
              <LiveWaveform stream={activeStream} isRecording={isRecording} />
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={cancelRecording}
                className="rounded-lg px-3 py-2 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-200/70 dark:hover:bg-[#2D2F31] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Discard
              </button>
              <button
                type="button"
                onClick={stopRecording}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-red-700 transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-red-600"
              >
                <Square className="h-3 w-3 fill-current" />
                <span>Stop recording</span>
              </button>
            </div>
          </div>
        )}

        {/* Bottom action toolbar */}
        <div className="flex items-center justify-between gap-3 px-3.5 py-3">
          <div className="flex items-center gap-2 min-w-0">
            {!isRecording ? (
              <button
                type="button"
                onClick={startRecording}
                disabled={isProcessing}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                  clips.length === 0
                    ? "bg-zinc-900 dark:bg-[#E8EAED] text-white dark:text-[#131314] hover:bg-zinc-800 dark:hover:bg-white"
                    : "border border-zinc-300 dark:border-[#3C4043] bg-zinc-50 dark:bg-[#282A2C] text-zinc-900 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-[#323437]"
                }`}
              >
                {clips.length === 0 ? (
                  <>
                    <Mic className="h-4 w-4" />
                    <span>Start recording</span>
                  </>
                ) : (
                  <>
                    <Plus className="h-4 w-4" />
                    <span>Add recording</span>
                  </>
                )}
              </button>
            ) : (
              <span className="text-xs text-zinc-500 dark:text-zinc-400 truncate pl-1">
                Speak in Urdu — click Stop recording when finished, then add more clips or Run.
              </span>
            )}

            {!isRecording && (
              <>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="audio/*"
                  multiple
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={isProcessing}
                  title="Upload audio file"
                  className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-medium text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-[#282A2C] transition-colors whitespace-nowrap shrink-0 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
                >
                  <Upload className="h-4 w-4" />
                  <span className="hidden sm:inline">Upload</span>
                </button>
              </>
            )}

            {!isRecording && clips.length === 0 && (
              <span className="hidden md:inline text-xs text-zinc-400 dark:text-zinc-500 truncate pl-1">
                Speak in Urdu · Record 1 or multiple clips before running
              </span>
            )}
          </div>

          <button
            type="button"
            onClick={onRun}
            disabled={!canRun}
            title={
              isRecording
                ? "Stop recording before running"
                : clips.length === 0
                ? "Record at least one clip first"
                : "Transcribe to English (Ctrl + Enter)"
            }
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap shrink-0 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
              canRun
                ? "bg-[#1A73E8] text-white hover:bg-[#1557B0] cursor-pointer"
                : "bg-zinc-100 dark:bg-[#282A2C] text-zinc-400 dark:text-zinc-500 cursor-not-allowed"
            }`}
          >
            {isProcessing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Transcribing</span>
              </>
            ) : (
              <>
                <span>Run</span>
                <CornerDownLeft className="h-3.5 w-3.5 opacity-80" />
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
});
