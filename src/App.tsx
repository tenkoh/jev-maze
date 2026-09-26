import { useCallback, useEffect, useRef, useState } from "react";
import type { NextStepResponse, Step } from "../shared/protocol";
import { fetchNextStep } from "./api";
import { MazeBoard } from "./components/MazeBoard";
import { CountdownOverlay, RecordingPanel, StepChips, TranscriptBox } from "./components/Panels";
import type { RobotPose } from "./components/Robot";
import { type End, interpret } from "./game/interpret";
import { type Maze, type Pos, samePos } from "./game/maze";
import { defaultSleep as sleep, MoveQueue } from "./game/moveQueue";
import { fixMisheard } from "./game/normalize";
import { findStage, pickStage, STAGES } from "./game/stages";
import {
  describeSpeechError,
  ensureMicPermission,
  isSpeechSupported,
  SpeechError,
  type SpeechSession,
  startListening,
} from "./speech";

const CELL_MS = 280;
const COUNTDOWN_MS = 1000;
const RECORD_MS = 3000;
/** Start recognition this long before recording so the first words are not clipped. */
const LISTEN_LEAD_MS = 500;

type FailReason = End | "error" | "no_speech" | "mic";

type Phase =
  | { name: "idle" }
  | { name: "preparing" }
  | { name: "countdown"; n: number }
  | { name: "recording"; startedAt: number }
  | { name: "running"; utterance: string | null; interpreting: boolean }
  | { name: "result"; utterance: string; clear: boolean; reason: FailReason; detail?: string };

type TraceEntry = { steps: number; ms: number; answer: NextStepResponse };

const RESULT_MESSAGE: Record<FailReason, string> = {
  done: "ゴールにたどり着けませんでした",
  confused: "理解できない指示がありました",
  limit: "指示が多すぎて最後まで実行できませんでした",
  error: "通信エラーが発生しました",
  no_speech: "声が聞き取れませんでした",
  mic: "マイクを使えませんでした",
};

const CONFETTI = [1, 2, 3, 4, 5, 6] as const;

const params = new URLSearchParams(window.location.search);
const DEBUG = params.has("debug");

const initialStage = findStage(params.get("stage")) ?? pickStage();

export function App() {
  const [maze, setMaze] = useState<Maze>(initialStage);
  const [phase, setPhase] = useState<Phase>({ name: "idle" });
  const [robot, setRobot] = useState<Pos>(initialStage.start);
  const [pose, setPose] = useState<RobotPose>("idle");
  const [pending, setPending] = useState(0);
  const [steps, setSteps] = useState<Step[]>([]);
  const [trace, setTrace] = useState<TraceEntry[]>([]);
  const [rawUtterance, setRawUtterance] = useState<string | null>(null);
  const runId = useRef(0);
  const cleanup = useRef<(() => void) | null>(null);

  const abortRun = useCallback(() => {
    runId.current++;
    cleanup.current?.();
    cleanup.current = null;
  }, []);
  useEffect(() => abortRun, [abortRun]);

  const reset = useCallback(
    (m: Maze) => {
      abortRun();
      setRobot(m.start);
      setPose("idle");
      setPending(0);
      setSteps([]);
      setTrace([]);
      setRawUtterance(null);
    },
    [abortRun],
  );

  const failMic = useCallback((e: unknown) => {
    const code = e instanceof SpeechError ? e.code : "unknown";
    setPose("confused");
    setPhase({
      name: "result",
      utterance: "",
      clear: false,
      reason: "mic",
      detail: describeSpeechError(code),
    });
  }, []);

  /** Run one attempt. With `typed`, skip the microphone and use that utterance (debug). */
  const play = useCallback(
    async (typed?: string) => {
      reset(maze);
      const run = runId.current;
      const alive = () => run === runId.current;

      let utterance: string;
      if (typed === undefined) {
        // Get the microphone ready before the countdown so a permission dialog
        // never cuts into the 3 seconds of speaking.
        setPhase({ name: "preparing" });
        try {
          if (!isSpeechSupported()) throw new SpeechError("not-supported");
          await ensureMicPermission();
        } catch (e) {
          if (alive()) failMic(e);
          return;
        }
        if (!alive()) return;
        // Start recognition shortly before recording (LISTEN_LEAD_MS): early enough to
        // catch the first words, late enough to ignore most countdown noise.
        let session: SpeechSession | undefined;
        const listen = (): SpeechSession | undefined => {
          try {
            const s = startListening();
            cleanup.current = () => s.abort();
            return s;
          } catch (e) {
            failMic(e);
            return undefined;
          }
        };
        // Stop right away if the microphone fails (e.g. permission denied) instead of
        // letting the player talk into a dead recognizer.
        const micFailed = () => {
          if (!session?.failure) return false;
          session.abort();
          failMic(session.failure);
          return true;
        };
        const ticks = [3, 2, 1];
        const listenAt = ticks.length * COUNTDOWN_MS - LISTEN_LEAD_MS;
        for (const [i, n] of ticks.entries()) {
          setPhase({ name: "countdown", n });
          const tickStart = i * COUNTDOWN_MS;
          if (!session && listenAt < tickStart + COUNTDOWN_MS) {
            // oxlint-disable-next-line no-await-in-loop -- the countdown is sequential by nature
            await sleep(listenAt - tickStart);
            if (!alive()) return;
            session = listen();
            if (!session) return;
            // oxlint-disable-next-line no-await-in-loop
            await sleep(tickStart + COUNTDOWN_MS - listenAt);
          } else {
            // oxlint-disable-next-line no-await-in-loop
            await sleep(COUNTDOWN_MS);
          }
          if (!alive() || micFailed()) return;
        }
        if (!session) {
          session = listen();
          if (!session) return;
        }
        setPhase({ name: "recording", startedAt: performance.now() });
        await sleep(RECORD_MS);
        if (!alive() || micFailed()) return;
        setPhase({ name: "running", utterance: null, interpreting: true });
        try {
          utterance = await session.finish();
        } catch (e) {
          if (alive()) failMic(e);
          return;
        }
        if (!alive()) return;
      } else {
        utterance = typed.trim();
      }
      if (DEBUG) setRawUtterance(utterance);
      utterance = fixMisheard(utterance);

      if (utterance === "") {
        setPose("confused");
        setPhase({ name: "result", utterance, clear: false, reason: "no_speech" });
        return;
      }

      setPhase({ name: "running", utterance, interpreting: true });
      const queue = new MoveQueue(
        maze,
        maze.start,
        {
          onMove: (pos) => {
            setRobot(pos);
            setPose("moving");
          },
          onBump: () => setPose("bump"),
          onPendingChange: setPending,
        },
        CELL_MS,
      );
      const controller = new AbortController();
      cleanup.current = () => {
        controller.abort();
        queue.cancel();
      };

      let end: End | "error";
      try {
        const result = await interpret(
          utterance,
          async (u, parsed) => {
            const t0 = performance.now();
            const answer = await fetchNextStep(u, parsed, controller.signal);
            if (DEBUG && alive()) {
              setTrace((t) => [...t, { steps: parsed.length, ms: performance.now() - t0, answer }]);
            }
            return answer;
          },
          (step) => {
            queue.enqueue(step);
            setSteps((s) => [...s, step]);
          },
        );
        end = result.end;
      } catch (e) {
        if (!alive()) return;
        console.error(e);
        end = "error";
      }
      if (!alive()) return;
      setPhase({ name: "running", utterance, interpreting: false });

      // Every queued move runs before the ending motion; then judge the final cell.
      await queue.drain();
      if (!alive()) return;
      const clear = samePos(queue.finalPosition, maze.goal);
      setPose(clear ? "happy" : end === "done" ? "stopped" : "confused");
      setPhase({ name: "result", utterance, clear, reason: end });
    },
    [maze, reset, failMic],
  );

  const changeStage = useCallback(
    (next: Maze) => {
      reset(next);
      setMaze(next);
      setPhase({ name: "idle" });
    },
    [reset],
  );

  // The maze stays face down until the player has to speak: they plan while talking.
  // A mic failure before recording keeps it hidden too, so a retry is still fresh.
  const mazeHidden =
    phase.name === "idle" ||
    phase.name === "preparing" ||
    phase.name === "countdown" ||
    (phase.name === "result" && phase.reason === "mic");

  // While Jev is thinking and nothing is left to animate, show the thinking bubble.
  const shownPose: RobotPose =
    phase.name === "running" && phase.interpreting && pending === 0 ? "thinking" : pose;

  return (
    <main className="app">
      <section className="card">
        <h1 className="title">Voice Maze</h1>
        <MazeBoard
          maze={maze}
          robot={robot}
          pose={shownPose}
          hidden={mazeHidden}
          // Animate only real moves; a reset should snap back to S, not slide across the board.
          cellMs={phase.name === "running" ? CELL_MS : 0}
          overlay={phase.name === "countdown" ? <CountdownOverlay n={phase.n} /> : undefined}
        />
        <div className="panel">
          <PhasePanel
            phase={phase}
            steps={steps}
            thinking={shownPose === "thinking"}
            onStart={() => void play()}
            onNewStage={() => changeStage(pickStage(Math.random, maze.id))}
          />
        </div>
      </section>
      {DEBUG && (
        <DebugPanel
          maze={maze}
          trace={trace}
          rawUtterance={rawUtterance}
          busy={phase.name !== "idle" && phase.name !== "result"}
          onRun={(text) => void play(text)}
          onStage={changeStage}
        />
      )}
    </main>
  );
}

function PhasePanel({
  phase,
  steps,
  thinking,
  onStart,
  onNewStage,
}: {
  phase: Phase;
  steps: Step[];
  thinking: boolean;
  onStart: () => void;
  onNewStage: () => void;
}) {
  switch (phase.name) {
    case "idle":
      return (
        <div className="stack">
          <button type="button" className="btn btn--primary btn--big" onClick={onStart}>
            START
          </button>
          <p className="hint">
            迷路が現れたらロボットに道順を指示して下さい。
            <br />
            例：「右に真っ直ぐ、下に２マス」
            {!isSpeechSupported() && (
              <>
                <br />
                <strong>このブラウザは音声認識に対応していません（Chrome を推奨）</strong>
              </>
            )}
          </p>
        </div>
      );
    case "preparing":
      return <p className="hint hint--lg">マイクを準備しています…</p>;
    case "countdown":
      // The number on the board says it all.
      return null;
    case "recording":
      return <RecordingPanel startedAt={phase.startedAt} durationMs={RECORD_MS} />;
    case "running":
      return (
        <div className="stack">
          <TranscriptBox text={phase.utterance} />
          <StepChips steps={steps} />
          <p className="hint hint--lg">{thinking ? "考えています…" : " "}</p>
        </div>
      );
    case "result":
      return (
        <div className="stack">
          {phase.utterance && <TranscriptBox text={phase.utterance} />}
          <StepChips steps={steps} />
          <div className={`result ${phase.clear ? "result--clear" : "result--failed"}`}>
            {phase.clear && (
              <span className="confetti" aria-hidden>
                {CONFETTI.map((c) => (
                  <i key={c} className={`confetti__piece confetti__piece--${c}`} />
                ))}
              </span>
            )}
            <p className="result__title">{phase.clear ? "CLEAR!" : "FAILED"}</p>
            <p className="result__msg">
              {phase.clear
                ? "ゴールにたどり着きました！"
                : (phase.detail ?? RESULT_MESSAGE[phase.reason])}
            </p>
          </div>
          <div className="row">
            <button type="button" className="btn btn--primary" onClick={onStart}>
              リプレイ
            </button>
            <button type="button" className="btn" onClick={onNewStage}>
              別の迷路
            </button>
          </div>
        </div>
      );
  }
}

const pct = (v: number) => `${Math.round(v * 100)}%`;

function DebugPanel({
  maze,
  trace,
  rawUtterance,
  busy,
  onRun,
  onStage,
}: {
  maze: Maze;
  trace: TraceEntry[];
  rawUtterance: string | null;
  busy: boolean;
  onRun: (text: string) => void;
  onStage: (m: Maze) => void;
}) {
  const [text, setText] = useState("右に突き当たりまで、下に突き当たりまで");
  return (
    <section className="debug" aria-label="debug">
      <h2>Debug</h2>
      <div className="row">
        <label>
          stage{" "}
          <select
            value={maze.id}
            onChange={(e) => {
              const s = findStage(e.target.value);
              if (s) onStage(s);
            }}
          >
            {STAGES.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id}
              </option>
            ))}
          </select>
        </label>
      </div>
      <form
        className="row"
        onSubmit={(e) => {
          e.preventDefault();
          onRun(text);
        }}
      >
        <input
          className="debug__input"
          value={text}
          onChange={(e) => setText(e.target.value)}
          aria-label="utterance"
        />
        <button type="submit" className="btn btn--primary" disabled={busy}>
          テキストで実行
        </button>
      </form>
      {rawUtterance !== null && <p className="row">raw: {rawUtterance || "(empty)"}</p>}
      {trace.length > 0 && (
        <table className="debug__trace">
          <thead>
            <tr>
              <th>#</th>
              <th>direction</th>
              <th>count</th>
              <th>is_done</th>
              <th>ms</th>
            </tr>
          </thead>
          <tbody>
            {trace.map((t, i) => (
              // Trace rows are append-only, so the index is a stable key.
              // oxlint-disable-next-line react/no-array-index-key
              <tr key={i}>
                <td>{t.steps}</td>
                <td>
                  {t.answer.nextDirection.choice} ({pct(t.answer.nextDirection.confidence)})
                </td>
                <td>
                  {t.answer.nextCount.choice} ({pct(t.answer.nextCount.confidence)})
                </td>
                <td>{pct(t.answer.isDone)}</td>
                <td>{Math.round(t.ms)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}
