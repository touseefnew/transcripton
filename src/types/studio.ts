export type FormatMode = "combined" | "per-clip";

export interface RecordedClip {
  id: string;
  name: string;
  durationSec: number;
  mimeType: string;
  blob?: Blob;
  audioUrl?: string;
  sizeBytes?: number;
}

export interface UrduClipSegment {
  name: string;
  text: string;
}

export interface TranscriptTurn {
  id: string;
  createdAt: number;
  clips: Array<{
    id: string;
    name: string;
    durationSec: number;
    mimeType: string;
    audioUrl?: string;
  }>;
  formatMode: FormatMode;
  status: "processing" | "done" | "error";
  englishTranscript?: string;
  originalUrduClips?: UrduClipSegment[];
  errorMessage?: string;
}

export interface StudioSession {
  id: string;
  title: string;
  updatedAt: number;
  turns: TranscriptTurn[];
}
