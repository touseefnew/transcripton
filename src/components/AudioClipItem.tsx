import { useEffect, useRef, useState } from "react";
import { Pause, Play, X, Volume2 } from "lucide-react";
import { formatDuration } from "../utils/audio";

interface AudioClipItemProps {
  name: string;
  durationSec: number;
  audioUrl?: string;
  onRemove?: () => void;
  compact?: boolean;
}

export function AudioClipItem({
  name,
  durationSec,
  audioUrl,
  onRemove,
  compact = false,
}: AudioClipItemProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [resolvedDuration, setResolvedDuration] = useState(durationSec);

  useEffect(() => {
    setResolvedDuration(durationSec);
  }, [durationSec]);

  useEffect(() => {
    const el = audioRef.current;
    if (!el) return;

    const handleTimeUpdate = () => setCurrentTime(el.currentTime || 0);
    const handleLoaded = () => {
      if (Number.isFinite(el.duration) && el.duration > 0) {
        setResolvedDuration(el.duration);
      }
    };
    const handleEnded = () => {
      setIsPlaying(false);
      setCurrentTime(0);
    };
    const handlePause = () => setIsPlaying(false);
    const handlePlay = () => setIsPlaying(true);

    el.addEventListener("timeupdate", handleTimeUpdate);
    el.addEventListener("loadedmetadata", handleLoaded);
    el.addEventListener("ended", handleEnded);
    el.addEventListener("pause", handlePause);
    el.addEventListener("play", handlePlay);

    return () => {
      el.removeEventListener("timeupdate", handleTimeUpdate);
      el.removeEventListener("loadedmetadata", handleLoaded);
      el.removeEventListener("ended", handleEnded);
      el.removeEventListener("pause", handlePause);
      el.removeEventListener("play", handlePlay);
    };
  }, [audioUrl]);

  const togglePlayback = () => {
    const el = audioRef.current;
    if (!el || !audioUrl) return;
    if (isPlaying) {
      el.pause();
    } else {
      el.play().catch(() => {});
    }
  };

  const progressPct =
    resolvedDuration > 0 ? Math.min(100, (currentTime / resolvedDuration) * 100) : 0;

  return (
    <div
      className={`group flex items-center gap-2.5 rounded-xl border border-zinc-200 dark:border-[#2D2F31] bg-zinc-50 dark:bg-[#1E1F20] transition-colors ${
        compact ? "px-2.5 py-2" : "px-3 py-2"
      }`}
    >
      {audioUrl ? (
        <>
          <audio ref={audioRef} src={audioUrl} preload="metadata" />
          <button
            type="button"
            onClick={togglePlayback}
            aria-label={isPlaying ? `Pause ${name}` : `Play ${name}`}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-white dark:bg-[#282A2C] border border-zinc-200 dark:border-[#3C4043] text-zinc-800 dark:text-zinc-100 hover:bg-zinc-100 dark:hover:bg-[#323437] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
          >
            {isPlaying ? (
              <Pause className="h-3.5 w-3.5 fill-current" />
            ) : (
              <Play className="h-3.5 w-3.5 fill-current translate-x-[0.5px]" />
            )}
          </button>
        </>
      ) : (
        <div
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-zinc-100 dark:bg-[#282A2C] text-zinc-400 dark:text-zinc-500"
        >
          <Volume2 className="h-3.5 w-3.5" />
        </div>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex items-center justify-between gap-2">
          <span className="truncate text-xs font-medium text-zinc-800 dark:text-zinc-200">
            {name}
          </span>
          <span className="font-mono text-[11px] tabular-nums text-zinc-500 dark:text-zinc-400 shrink-0">
            {isPlaying
              ? `${formatDuration(currentTime)} / ${formatDuration(resolvedDuration)}`
              : formatDuration(resolvedDuration)}
          </span>
        </div>

        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-zinc-200 dark:bg-[#323437]">
          <div
            className="h-full rounded-full bg-blue-600 dark:bg-blue-400 transition-[width] duration-100"
            style={{ width: `${progressPct}%` }}
          />
        </div>
      </div>

      {onRemove && (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${name}`}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 hover:text-zinc-700 hover:bg-zinc-200/70 dark:text-zinc-500 dark:hover:text-zinc-200 dark:hover:bg-[#323437] transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 cursor-pointer"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      )}
    </div>
  );
}
