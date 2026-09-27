// Thin wrapper around the Web Speech API (Chrome/Edge/Safari expose it as webkitSpeechRecognition).

type RecognitionAlternative = { transcript: string };
type RecognitionResult = { isFinal: boolean; 0: RecognitionAlternative; length: number };
type RecognitionEvent = { results: ArrayLike<RecognitionResult> };
type RecognitionErrorEvent = { error: string };

/** Lifecycle events that carry no payload we read; logged in debug mode only. */
const LIFECYCLE_EVENTS = [
  "start",
  "audiostart",
  "soundstart",
  "speechstart",
  "speechend",
  "soundend",
  "audioend",
  "nomatch",
] as const;

type RecognitionEventMap = {
  result: RecognitionEvent;
  error: RecognitionErrorEvent;
  end: Event;
} & Record<(typeof LIFECYCLE_EVENTS)[number], Event>;

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

// iPadOS reports itself as a Mac; touch support tells it apart.
const isIos = (ua: string, maxTouchPoints: number): boolean =>
  /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && maxTouchPoints > 1);

/**
 * True for iOS browsers other than Safari (Chrome, Firefox, Edge, in-app browsers).
 * They run on WKWebView, which exposes webkitSpeechRecognition but reportedly does
 * not enable it (Chrome on iPhone never heard anything), and asks for the
 * microphone on every getUserMedia call.
 */
export function isIosNonSafari(ua: string, maxTouchPoints: number): boolean {
  if (!isIos(ua, maxTouchPoints)) return false;
  // Safari has "Version/x"; other browsers either lack it or add their own token.
  return !/Version\//.test(ua) || /CriOS|FxiOS|EdgiOS|OPiOS|OPT\/|GSA\//.test(ua);
}

export const isUnsupportedIosBrowser = (): boolean =>
  isIosNonSafari(navigator.userAgent, navigator.maxTouchPoints);

export const isIosSafari = (): boolean =>
  isIos(navigator.userAgent, navigator.maxTouchPoints) && !isUnsupportedIosBrowser();

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

export type MicHandle = {
  /** Close whatever prepareMic left open. Safe to call more than once. */
  release(): void;
  /** Track state for the debug log (held stream only). */
  status(): string | undefined;
  /**
   * Peak input level since the last call, or undefined when too little was metered.
   * Exactly 0 is digital silence: a live microphone always picks up some noise.
   */
  takePeak(): number | undefined;
};

const NO_MIC: MicHandle = { release() {}, status: () => undefined, takePeak: () => undefined };

async function micPermissionState(): Promise<string> {
  try {
    const p = await navigator.permissions.query({ name: "microphone" as PermissionName });
    return p.state;
  } catch {
    return "unknown";
  }
}

/**
 * Get the microphone ready up front (START), so a first-time permission dialog
 * never eats into the recording window. Browsers without getUserMedia are left
 * to the recognizer to report.
 *
 * With `meterCtx` (iOS Safari), the stream stays open and metered until release:
 * iOS sometimes feeds the page digital silence, and the level tells that apart
 * from a player who said nothing. The context must be created inside the tap.
 */
export async function prepareMic(
  log?: (msg: string) => void,
  meterCtx?: AudioContext,
): Promise<MicHandle> {
  // Whether a permission dialog shows up correlates with the iOS silence; worth logging.
  if (log) log(`mic hold=${meterCtx !== undefined} permission=${await micPermissionState()}`);
  const media = navigator.mediaDevices as MediaDevices | undefined;
  if (!media?.getUserMedia) return NO_MIC;
  let stream: MediaStream;
  try {
    log?.("getUserMedia");
    stream = await media.getUserMedia({ audio: true });
    log?.("getUserMedia ok");
  } catch (e) {
    log?.(`getUserMedia failed ${String(e)}`);
    const name = e instanceof DOMException ? e.name : "";
    if (name === "NotAllowedError" || name === "SecurityError")
      throw new SpeechError("not-allowed");
    if (name === "NotFoundError" || name === "NotReadableError")
      throw new SpeechError("audio-capture");
    throw new SpeechError("unknown");
  }
  const tracks = stream.getTracks();
  const stop = () => {
    for (const track of tracks) track.stop();
  };
  if (!meterCtx) {
    stop();
    return NO_MIC;
  }
  if (log) {
    for (const track of tracks) {
      for (const type of ["mute", "unmute", "ended"] as const) {
        track.addEventListener(type, () => log(`track ${type}`));
      }
    }
  }
  const meter = createMeter(meterCtx, stream, log);
  let released = false;
  return {
    release() {
      if (released) return;
      released = true;
      meter.close();
      stop();
      log?.("track released");
    },
    status: () => tracks.map((t) => `track muted=${t.muted} state=${t.readyState}`).join(", "),
    takePeak: () => meter.takePeak(),
  };
}

/** Fewer samples than this are not enough to call a window silent. */
const MIN_WINDOW_SAMPLES = 5;

/** Sample the input's peak level every 100ms; also log it once a second. */
function createMeter(ctx: AudioContext, stream: MediaStream, log?: (msg: string) => void) {
  const source = ctx.createMediaStreamSource(stream);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 2048;
  source.connect(analyser);
  void ctx.resume();
  log?.(`meter context=${ctx.state}`);
  const buf = new Float32Array(analyser.fftSize);
  let logPeak = 0;
  let windowPeak = 0;
  let windowSamples = 0;
  let ticks = 0;
  const timer = setInterval(() => {
    // A suspended context reads as silence, which must not look like a dead mic.
    if (ctx.state !== "running") return;
    analyser.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    logPeak = Math.max(logPeak, peak);
    windowPeak = Math.max(windowPeak, peak);
    windowSamples++;
    if (++ticks % 10 === 0) {
      log?.(`level peak=${logPeak.toFixed(3)}`);
      logPeak = 0;
    }
  }, 100);
  return {
    takePeak() {
      const peak = windowSamples >= MIN_WINDOW_SAMPLES ? windowPeak : undefined;
      windowPeak = 0;
      windowSamples = 0;
      return peak;
    },
    close() {
      clearInterval(timer);
      source.disconnect();
      void ctx.close();
    },
  };
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

export function startListening(lang = "ja-JP", log?: (msg: string) => void): SpeechSession {
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

  if (log) for (const type of LIFECYCLE_EVENTS) rec.addEventListener(type, () => log(type));
  rec.addEventListener("result", (e) => {
    transcript = Array.from(e.results, (r) => r[0].transcript).join("");
    log?.(`result ${JSON.stringify(transcript)}`);
  });
  rec.addEventListener("error", (e) => {
    log?.(`error ${e.error}`);
    // "no-speech" and "aborted" just mean an empty result.
    if (e.error !== "no-speech" && e.error !== "aborted") fatal = new SpeechError(e.error);
  });
  rec.addEventListener("end", () => {
    log?.("end");
    ended = true;
    for (const w of endWaiters.splice(0)) w();
  });
  log?.("start()");
  rec.start();

  return {
    async finish() {
      if (!ended) {
        const flushed = new Promise<void>((r) => endWaiters.push(r));
        log?.("stop()");
        rec.stop();
        let timer: ReturnType<typeof setTimeout> | undefined;
        await Promise.race([
          flushed,
          new Promise((r) => (timer = setTimeout(r, FLUSH_TIMEOUT_MS))),
        ]);
        clearTimeout(timer);
        // A recognizer that never ends would keep holding the microphone.
        if (!ended) {
          log?.(`no end after ${FLUSH_TIMEOUT_MS}ms, abort()`);
          ended = true;
          rec.abort();
        }
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
