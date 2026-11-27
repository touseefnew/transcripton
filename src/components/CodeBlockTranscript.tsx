import { useState } from "react";
import { Check, ChevronDown, ChevronRight, Copy, Download, WrapText } from "lucide-react";
import type { UrduClipSegment } from "../types/studio";

interface CodeBlockTranscriptProps {
  transcript: string;
  originalUrduClips?: UrduClipSegment[];
}

export function CodeBlockTranscript({
  transcript,
  originalUrduClips,
}: CodeBlockTranscriptProps) {
  const [copied, setCopied] = useState(false);
  const [wordWrap, setWordWrap] = useState(true);
  const [showOriginalUrdu, setShowOriginalUrdu] = useState(false);

  const wordCount = transcript
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(transcript);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback copy via temporary textarea
      const textarea = document.createElement("textarea");
      textarea.value = transcript;
      textarea.style.position = "fixed";
      textarea.style.opacity = "0";
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand("copy");
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleDownload = () => {
    const blob = new Blob([transcript], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `english-transcript-${new Date().toISOString().slice(0, 10)}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-2.5">
      {/* Code block container */}
      <div className="overflow-hidden rounded-xl border border-zinc-200 dark:border-[#2D2F31] bg-[#F8F9FA] dark:bg-[#191A1C]">
        {/* Code block header */}
        <div className="flex items-center justify-between gap-4 border-b border-zinc-200 dark:border-[#2D2F31] bg-zinc-100/80 dark:bg-[#202124] px-4 py-2">
          <div className="flex items-center gap-2 text-xs text-zinc-500 dark:text-zinc-400">
            <span className="font-mono font-medium text-zinc-700 dark:text-zinc-300">
              english-transcript.txt
            </span>
            <span aria-hidden="true">·</span>
            <span className="tabular-nums">{wordCount} {wordCount === 1 ? "word" : "words"}</span>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            <button
              type="button"
              onClick={() => setWordWrap((prev) => !prev)}
              title={wordWrap ? "Disable word wrap" : "Enable word wrap"}
              className={`inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                wordWrap
                  ? "text-zinc-700 dark:text-zinc-200 bg-zinc-200/70 dark:bg-[#2E3033]"
                  : "text-zinc-500 dark:text-zinc-400 hover:text-zinc-800 dark:hover:text-zinc-200 hover:bg-zinc-200/50 dark:hover:bg-[#2A2C2F]"
              }`}
            >
              <WrapText className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Wrap</span>
            </button>

            <button
              type="button"
              onClick={handleDownload}
              title="Download as .txt"
              className="inline-flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-zinc-600 dark:text-zinc-300 hover:text-zinc-900 dark:hover:text-white hover:bg-zinc-200/60 dark:hover:bg-[#2A2C2F] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Download</span>
            </button>

            <button
              type="button"
              onClick={handleCopy}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                copied
                  ? "bg-emerald-600 text-white"
                  : "bg-zinc-900 dark:bg-[#E8EAED] text-white dark:text-[#131314] hover:bg-zinc-700 dark:hover:bg-white"
              }`}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Code block body */}
        <pre
          className={`overflow-x-auto p-4 sm:p-5 font-mono text-[13.5px] leading-relaxed text-zinc-900 dark:text-[#E8EAED] select-all ${
            wordWrap ? "whitespace-pre-wrap break-words" : "whitespace-pre"
          }`}
        >
          <code>{transcript}</code>
        </pre>
      </div>

      {/* Optional collapsible original Urdu transcription */}
      {originalUrduClips && originalUrduClips.length > 0 && (
        <div>
          <button
            type="button"
            onClick={() => setShowOriginalUrdu((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors py-1 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 rounded"
          >
            {showOriginalUrdu ? (
              <ChevronDown className="h-3.5 w-3.5" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5" />
            )}
            <span>
              {showOriginalUrdu ? "Hide original Urdu speech" : "View original Urdu speech"}
            </span>
          </button>

          {showOriginalUrdu && (
            <div className="mt-2 space-y-2 rounded-lg border border-zinc-200 dark:border-[#2D2F31] bg-zinc-50/70 dark:bg-[#1B1C1E] p-3.5 text-sm text-zinc-700 dark:text-zinc-300">
              {originalUrduClips.map((segment, idx) => (
                <div key={`${segment.name}-${idx}`} className="space-y-1">
                  {originalUrduClips.length > 1 && (
                    <p className="text-[11px] font-medium text-zinc-500 dark:text-zinc-400">
                      {segment.name}
                    </p>
                  )}
                  <p dir="auto" className="leading-relaxed">
                    {segment.text}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
