import { useEffect, useState } from "react";
import type { Step } from "../../shared/protocol";

export function CountdownOverlay({ n }: { n: number }) {
  return (
    <div className="countdown" key={n} aria-live="assertive">
      <span className="countdown__burst countdown__burst--left" aria-hidden />
      <span className="countdown__num">{n}</span>
      <span className="countdown__burst countdown__burst--right" aria-hidden />
    </div>
  );
}

export function MicIcon({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <rect x="8.5" y="2.5" width="7" height="12" rx="3.5" fill="currentColor" />
      <path
        d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7"
        stroke="currentColor"
        strokeWidth="1.8"
        fill="none"
        strokeLinecap="round"
      />
    </svg>
  );
}

export function RecordingPanel({
  startedAt,
  durationMs,
}: {
  startedAt: number;
  durationMs: number;
}) {
  const [now, setNow] = useState(() => performance.now());
  useEffect(() => {
    let id = 0;
    const tick = () => {
      setNow(performance.now());
      id = requestAnimationFrame(tick);
    };
    id = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(id);
  }, []);
  const remaining = Math.max(0, durationMs - (now - startedAt));
  const ratio = remaining / durationMs;
  return (
    <div className="recording">
      <div className="recording__mic">
        <span className="wave wave--left" aria-hidden>
          <i />
          <i />
          <i />
        </span>
        <span className="recording__circle">
          <MicIcon size={40} />
        </span>
        <span className="wave wave--right" aria-hidden>
          <i />
          <i />
          <i />
        </span>
      </div>
      <div className="recording__timer">
        <div className="progress" role="progressbar" aria-valuenow={Math.round(ratio * 100)}>
          <div className="progress__bar" style={{ width: `${ratio * 100}%` }} />
        </div>
        <span className="recording__secs">{(remaining / 1000).toFixed(1)} 秒</span>
      </div>
      <p className="hint">話してください</p>
    </div>
  );
}

const ARROW = { north: "↑", east: "→", south: "↓", west: "←" } as const;
const DIR_JA = { north: "上", east: "右", south: "下", west: "左" } as const;
const COUNT_JA: Record<Step["count"], string> = {
  "1": "1マス",
  "2": "2マス",
  "3": "3マス",
  "4": "4マス",
  until_wall: "突き当たりまで",
  until_junction: "分かれ道まで",
  unspecified: "突き当たりまで",
};

export function StepChips({ steps }: { steps: readonly Step[] }) {
  if (steps.length === 0) return null;
  return (
    <ol className="steps" aria-label="解釈された指示">
      {steps.map((s, i) => (
        // Steps are append-only, so the index is a stable key.
        // oxlint-disable-next-line react/no-array-index-key
        <li key={i} className="steps__chip" title={`${s.direction} × ${s.count}`}>
          <span className="steps__arrow">{ARROW[s.direction]}</span>
          {DIR_JA[s.direction]}へ{COUNT_JA[s.count]}
        </li>
      ))}
    </ol>
  );
}

export function TranscriptBox({ text }: { text: string | null }) {
  return (
    <div className="transcript">
      <span className="transcript__icon">
        <MicIcon />
      </span>
      <span className="transcript__text">
        {text === null ? <span className="muted">聞き取っています…</span> : `“${text}”`}
      </span>
    </div>
  );
}
