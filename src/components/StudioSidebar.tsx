import { Moon, Plus, Sun, Trash2, X } from "lucide-react";
import type { FormatMode, StudioSession } from "../types/studio";
import { formatRelativeTime } from "../utils/audio";

interface StudioSidebarProps {
  sessions: StudioSession[];
  activeSessionId: string;
  onSelectSession: (id: string) => void;
  onNewSession: () => void;
  onDeleteSession: (id: string) => void;
  formatMode: FormatMode;
  onChangeFormatMode: (mode: FormatMode) => void;
  theme: "light" | "dark";
  onChangeTheme: (theme: "light" | "dark") => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
}

export function StudioSidebar({
  sessions,
  activeSessionId,
  onSelectSession,
  onNewSession,
  onDeleteSession,
  formatMode,
  onChangeFormatMode,
  theme,
  onChangeTheme,
  mobileOpen,
  onCloseMobile,
}: StudioSidebarProps) {
  const sidebarInner = (
    <div className="flex h-full flex-col bg-[#F8F9FA] dark:bg-[#1E1F20] border-r border-zinc-200 dark:border-[#2D2F31]">
      {/* Top action */}
      <div className="flex items-center justify-between gap-2 p-4 border-b border-zinc-200/80 dark:border-[#2D2F31]">
        <button
          type="button"
          onClick={() => {
            onNewSession();
            onCloseMobile();
          }}
          className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-zinc-900 dark:bg-[#E8EAED] px-4 py-2.5 text-sm font-medium text-white dark:text-[#131314] hover:bg-zinc-800 dark:hover:bg-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600"
        >
          <Plus className="h-4 w-4" />
          <span>New session</span>
        </button>

        <button
          type="button"
          onClick={onCloseMobile}
          aria-label="Close sidebar"
          className="flex lg:hidden h-10 w-10 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-200/60 dark:text-zinc-400 dark:hover:bg-[#2D2F31] cursor-pointer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Sessions list */}
      <div className="flex-1 overflow-y-auto px-3 py-3">
        <p className="px-2 pb-2 text-xs font-medium text-zinc-500 dark:text-zinc-400">
          Recent sessions
        </p>

        {sessions.length === 0 ? (
          <p className="px-2 py-4 text-xs text-zinc-500 dark:text-zinc-400 leading-relaxed">
            Your voice transcript sessions will appear here.
          </p>
        ) : (
          <ul className="space-y-0.5">
            {sessions.map((session) => {
              const isActive = session.id === activeSessionId;
              const totalClips = session.turns.reduce(
                (acc, turn) => acc + turn.clips.length,
                0
              );

              return (
                <li key={session.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSession(session.id);
                      onCloseMobile();
                    }}
                    className={`w-full rounded-lg px-2.5 py-2.5 pr-9 text-left transition-colors cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 ${
                      isActive
                        ? "bg-zinc-200/80 dark:bg-[#2D2F31] text-zinc-900 dark:text-white"
                        : "text-zinc-700 dark:text-zinc-300 hover:bg-zinc-200/50 dark:hover:bg-[#282A2C]"
                    }`}
                  >
                    <div className="truncate text-sm font-medium">
                      {session.title}
                    </div>
                    <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-zinc-500 dark:text-zinc-400 tabular-nums">
                      <span>
                        {totalClips} {totalClips === 1 ? "clip" : "clips"}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span>{formatRelativeTime(session.updatedAt)}</span>
                    </div>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteSession(session.id);
                    }}
                    aria-label={`Delete ${session.title}`}
                    className="absolute right-1.5 top-1/2 -translate-y-1/2 flex h-7 w-7 items-center justify-center rounded-md text-zinc-400 opacity-0 group-hover:opacity-100 focus:opacity-100 hover:bg-zinc-300/60 hover:text-zinc-800 dark:hover:bg-[#3C4043] dark:hover:text-zinc-100 transition-all cursor-pointer"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      {/* Studio preferences footer */}
      <div className="border-t border-zinc-200 dark:border-[#2D2F31] p-4 space-y-3.5">
        {/* Multi-clip output mode */}
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Multi-clip output
          </span>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-200/70 dark:bg-[#131314] p-1">
            <button
              type="button"
              onClick={() => onChangeFormatMode("combined")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                formatMode === "combined"
                  ? "bg-white dark:bg-[#282A2C] text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              Combined
            </button>
            <button
              type="button"
              onClick={() => onChangeFormatMode("per-clip")}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                formatMode === "per-clip"
                  ? "bg-white dark:bg-[#282A2C] text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              Per clip
            </button>
          </div>
        </div>

        {/* Appearance toggle */}
        <div className="space-y-1.5">
          <span className="block text-xs font-medium text-zinc-500 dark:text-zinc-400">
            Appearance
          </span>
          <div className="grid grid-cols-2 gap-1 rounded-lg bg-zinc-200/70 dark:bg-[#131314] p-1">
            <button
              type="button"
              onClick={() => onChangeTheme("light")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                theme === "light"
                  ? "bg-white dark:bg-[#282A2C] text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              <Sun className="h-3.5 w-3.5" />
              <span>Light</span>
            </button>
            <button
              type="button"
              onClick={() => onChangeTheme("dark")}
              className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap cursor-pointer ${
                theme === "dark"
                  ? "bg-white dark:bg-[#282A2C] text-zinc-900 dark:text-white shadow-xs"
                  : "text-zinc-600 dark:text-zinc-400 hover:text-zinc-900 dark:hover:text-zinc-200"
              }`}
            >
              <Moon className="h-3.5 w-3.5" />
              <span>Dark</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {/* Desktop rail */}
      <aside className="hidden lg:block w-[260px] shrink-0 h-full">
        {sidebarInner}
      </aside>

      {/* Mobile slide-over drawer */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-black/40 backdrop-blur-[1px]"
            onClick={onCloseMobile}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-[280px] max-w-[85vw] h-full">
            {sidebarInner}
          </aside>
        </div>
      )}
    </>
  );
}
