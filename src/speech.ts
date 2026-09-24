// Thin wrapper around the Web Speech API (Chrome/Edge/Safari expose it as webkitSpeechRecognition).

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; 0: RecognitionAlternative; length: number };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };

type RecognitionEventMap = {
  result: RecognitionEvent;
  error: RecognitionErrorEvent;
  end: Event;
};

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  addEventListener<K extends keyof RecognitionEventMap>(
    type: K,
    listener: (e: RecognitionEventMap[K]) => void,
  ): void;
  start(): void;
  stop(): void;
  abort(): void;
};

type RecognitionCtor = new () => Recognition;

const getCtor = (): RecognitionCtor | undefined => {
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

export const isSpeechSupported = (): boolean => getCtor() !== undefined;

/** User-facing explanation for a speech error code. */
export function describeSpeechError(code: string): string {
  switch (code) {
    case "not-allowed":
    case "service-not-allowed":
      return "マイクの使用が許可されていません";
    case "audio-capture":
      return "マイクが見つかりませんでした";
    case "network":
      return "音声認識サービスに接続できませんでした";
    case "not-supported":
      return "このブラウザは音声認識に対応していません";
    default:
      return "マイクを使えませんでした";
  }
}

/**
 * Ask for microphone access up front (START), so a first-time permission dialog
 * never eats into the recording window. Browsers without getUserMedia are left
 * to the recognizer to report.
 */
export async function ensureMicPermission(): Promise<void> {
  const media = navigator.mediaDevices as MediaDevices | undefined;
  if (!media?.getUserMedia) return;
  try {
    const stream = await media.getUserMedia({ audio: true });
    for (const track of stream.getTracks()) track.stop();
  } catch (e) {
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError")
      throw new SpeechError("not-allowed");
    if (name === "NotFoundError" || name === "NotReadableError")
      throw new SpeechError("audio-capture");
    throw new SpeechError("unknown");
  }
}

export class SpeechError extends Error {
  constructor(readonly code: string) {
    super(`speech recognition error: ${code}`);
  }
}

export type SpeechSession = {
  /** Stop listening and resolve with the final transcript (interim text included). */
  finish(): Promise<string>;
  abort(): void;
  /** A fatal error reported so far (e.g. permission denied), if any. */
  readonly failure: SpeechError | undefined;
};

/** How long to wait for the recognizer to flush final results after stop(). */
const FLUSH_TIMEOUT_MS = 1200;

export function startListening(lang = "ja-JP"): SpeechSession {
  const Ctor = getCtor();
  if (!Ctor) throw new SpeechError("not-supported");

  const rec = new Ctor();
  rec.lang = lang;
  rec.continuous = true;
  rec.interimResults = true;

  let transcript = "";
  let fatal: SpeechError | undefined;
  let ended = false;
  const endWaiters: (() => void)[] = [];

  rec.addEventListener("result", (e) => {
    transcript = Array.from(e.results, (r) => r[0].transcript).join("");
  });
  rec.addEventListener("error", (e) => {
    // "no-speech" and "aborted" just mean an empty result.
    if (e.error !== "no-speech" && e.error !== "aborted") fatal = new SpeechError(e.error);
  });
  rec.addEventListener("end", () => {
    ended = true;
    for (const w of endWaiters.splice(0)) w();
  });
  rec.start();

  return {
    async finish() {
      if (!ended) {
        const flushed = new Promise<void>((r) => endWaiters.push(r));
        rec.stop();
        await Promise.race([flushed, new Promise((r) => setTimeout(r, FLUSH_TIMEOUT_MS))]);
      }
      if (fatal) throw fatal;
      return transcript.trim();
    },
    get failure() {
      return fatal;
    },
    abort() {
      ended = true;
      rec.abort();
    },
  };
}
