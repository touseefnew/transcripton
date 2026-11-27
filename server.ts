import "dotenv/config";
import express from "express";
import path from "path";
import { fileURLToPath } from "url";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, ThinkingLevel, Type } from "@google/genai";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const IS_PROD = process.env.NODE_ENV === "production";

const ALLOWED_AUDIO_MIME_TYPES = new Set([
  "audio/webm",
  "audio/mp4",
  "audio/mpeg",
  "audio/mp3",
  "audio/wav",
  "audio/ogg",
  "audio/aac",
  "audio/flac",
  "audio/x-wav",
]);

function normalizeAudioMimeType(raw: string): string | null {
  const base = (raw || "").split(";")[0].trim().toLowerCase();
  if (base === "audio/x-m4a" || base === "audio/m4a") {
    return "audio/mp4";
  }
  if (base === "audio/x-wav") {
    return "audio/wav";
  }
  if (ALLOWED_AUDIO_MIME_TYPES.has(base)) {
    return base;
  }
  if (base.startsWith("audio/")) {
    return base;
  }
  return null;
}

function createGeminiClient(): GoogleGenAI {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error(
        "Gemini API key is not configured. Please check Settings > Secrets to ensure GEMINI_API_KEY is set."
      ),
      { status: 500 }
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 2): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err: unknown) {
      lastError = err;
      const status =
        typeof err === "object" && err !== null && "status" in err
          ? Number((err as { status?: number }).status)
          : 0;
      const isTransient = status === 429 || status === 503 || status === 500;
      if (!isTransient || attempt === maxRetries) {
        throw err;
      }
      const delayMs = 600 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}

interface IncomingClip {
  id: string;
  name: string;
  mimeType: string;
  base64: string;
  durationSec?: number;
}

interface TranscribeRequestBody {
  clips?: IncomingClip[];
  formatMode?: "combined" | "per-clip";
}

function extractApiError(err: unknown): { status: number; message: string } {
  const rawMessage =
    err instanceof Error ? err.message : "An unexpected error occurred during transcription.";
  const status =
    typeof err === "object" && err !== null && "status" in err
      ? Number((err as { status?: number }).status)
      : 500;

  if (
    status === 403 ||
    rawMessage.includes("PERMISSION_DENIED") ||
    rawMessage.includes("API_KEY_INVALID")
  ) {
    return {
      status: 403,
      message:
        "API key permission denied or invalid. Please check your API key in Settings > Secrets.",
    };
  }
  if (status === 429 || rawMessage.includes("RESOURCE_EXHAUSTED")) {
    return {
      status: 429,
      message:
        "Rate limit reached. Please wait a few seconds and try again, or check your quota in Settings > Secrets.",
    };
  }
  return {
    status: status >= 400 && status < 600 ? status : 500,
    message: rawMessage,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "60mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true });
  });

  app.post("/api/transcribe", async (req, res) => {
    try {
      const body = req.body as TranscribeRequestBody;
      const clips = body?.clips;
      const formatMode = body?.formatMode === "per-clip" ? "per-clip" : "combined";

      if (!Array.isArray(clips) || clips.length === 0) {
        return res.status(400).json({ error: "Please record or attach at least one audio clip." });
      }
      if (clips.length > 20) {
        return res.status(400).json({ error: "You can transcribe up to 20 audio clips per run." });
      }

      const validatedClips = clips.map((clip, index) => {
        if (!clip || typeof clip.base64 !== "string" || clip.base64.trim().length < 16) {
          throw Object.assign(
            new Error(`Recording ${index + 1} appears to be empty. Please record again.`),
            { status: 400 }
          );
        }
        const mimeType = normalizeAudioMimeType(clip.mimeType);
        if (!mimeType) {
          throw Object.assign(
            new Error(`Recording ${index + 1} has an unsupported audio format.`),
            { status: 400 }
          );
        }
        return {
          index: index + 1,
          name: typeof clip.name === "string" && clip.name.trim() ? clip.name.trim() : `Recording ${index + 1}`,
          mimeType,
          base64: clip.base64.trim(),
        };
      });

      const ai = createGeminiClient();

      // Step 1: Transcribe each recording with gemini-3.5-transcribe in parallel
      const perClipResults = await Promise.all(
        validatedClips.map(async (clip) => {
          try {
            const response = await withRetry(() =>
              ai.models.generateContent({
                model: "gemini-3.5-transcribe",
                contents: {
                  parts: [
                    {
                      inlineData: {
                        mimeType: clip.mimeType,
                        data: clip.base64,
                      },
                    },
                    {
                      text: "Transcribe this audio accurately. The speaker is primarily speaking in Urdu (and may mix in English terms). Return only the exact verbatim spoken transcript with no commentary.",
                    },
                  ],
                },
              })
            );
            const transcript = (response.text ?? "").trim();
            return {
              ...clip,
              rawTranscript: transcript,
              needsDirectAudioFallback: transcript.length === 0,
            };
          } catch {
            // Fall back to direct audio understanding in Step 2 if transcribe endpoint rejects a container variant
            return {
              ...clip,
              rawTranscript: "",
              needsDirectAudioFallback: true,
            };
          }
        })
      );

      // Step 2: Translate Urdu speech/transcripts into clean, natural English using gemini-4-hydrogen
      const parts: Array<{ text: string } | { inlineData: { mimeType: string; data: string } }> = [];

      for (const item of perClipResults) {
        if (item.needsDirectAudioFallback) {
          parts.push({
            text: `Recording ${item.index} (${item.name}) audio:`,
          });
          parts.push({
            inlineData: {
              mimeType: item.mimeType,
              data: item.base64,
            },
          });
        } else {
          parts.push({
            text: `Recording ${item.index} (${item.name}) original transcript:\n${item.rawTranscript}`,
          });
        }
      }

      const formatInstruction =
        formatMode === "per-clip" && validatedClips.length > 1
          ? `Format "englishTranscript" with clear per-recording sections in order:\n[Recording 1]\n<English translation of Recording 1>\n\n[Recording 2]\n<English translation of Recording 2>\n(and so on for all ${validatedClips.length} recordings).`
          : validatedClips.length > 1
          ? `Combine all ${validatedClips.length} recordings seamlessly in chronological order (Recording 1 through Recording ${validatedClips.length}) into one cohesive, natural, well-punctuated English transcript.`
          : `Output the complete, natural, well-punctuated English translation of the recording.`;

      parts.push({
        text: `Translate all provided Urdu (and any mixed English) recordings above into clear, accurate, natural English.\n\nRules:\n1. Output MUST be strictly in English (translate every Urdu phrase accurately while keeping English technical terms intact).\n2. Preserve the speaker's exact meaning, tone, and intent—do not add explanations, greetings, or markdown code fences.\n3. ${formatInstruction}\n4. Also provide a concise 3-to-6-word English "sessionTitle" summarizing the topic.`,
      });

      const translationResponse = await withRetry(() =>
        ai.models.generateContent({
          model: "gemini-4-hydrogen",
          contents: { parts },
          config: {
            systemInstruction:
              "You are an expert Urdu-to-English speech translator and transcription editor. Your sole job is to produce faithful, natural, publication-clean English transcripts from spoken Urdu recordings. Never include meta-commentary or markdown code fences inside the transcript string.",
            thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
            responseMimeType: "application/json",
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                englishTranscript: {
                  type: Type.STRING,
                  description: "The clean, complete English transcript with no markdown fences or preamble.",
                },
                sessionTitle: {
                  type: Type.STRING,
                  description: "A concise 3 to 6 word title in English describing the transcript.",
                },
              },
              required: ["englishTranscript", "sessionTitle"],
            },
          },
        })
      );

      const rawJson = (translationResponse.text ?? "{}").trim();
      let parsed: { englishTranscript?: string; sessionTitle?: string } = {};
      try {
        parsed = JSON.parse(rawJson);
      } catch {
        parsed = {
          englishTranscript: rawJson,
          sessionTitle: "Urdu Voice Transcript",
        };
      }

      const englishTranscript = (parsed.englishTranscript ?? "")
        .replace(/^```[a-z]*\n?/i, "")
        .replace(/\n?```$/i, "")
        .trim();

      if (!englishTranscript) {
        return res.status(422).json({
          error:
            "No speech could be detected in the recording. Please check your microphone and try speaking clearly.",
        });
      }

      const originalUrduClips = perClipResults
        .filter((r) => r.rawTranscript.length > 0)
        .map((r) => ({
          name: r.name,
          text: r.rawTranscript,
        }));

      return res.json({
        englishTranscript,
        sessionTitle: (parsed.sessionTitle || "Voice Transcript").trim(),
        originalUrduClips,
        clipCount: validatedClips.length,
      });
    } catch (err: unknown) {
      const { status, message } = extractApiError(err);
      console.error("[/api/transcribe] Error:", err);
      return res.status(status).json({ error: message });
    }
  });

  if (IS_PROD) {
    const distPath = path.resolve(__dirname, "dist");
    app.use(express.static(distPath));
    app.get("/{*splat}", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  } else {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Voice Script Studio server running on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
