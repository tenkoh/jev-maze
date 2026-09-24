import {
  type ChoiceAnswer,
  type CountLabel,
  isCount,
  isDirection,
  MAX_STEPS,
  type NextStepResponse,
  type Step,
} from "../../shared/protocol";

// Thresholds are starting points; tune them on real utterances.
export const DONE_TH = 0.8;
export const CONF_TH = 0.7;
/** Combined probability required when the count is split between equivalent labels. */
export const GROUP_PROB_TH = 0.85;

/** Count labels that produce the same movement (see pathForStep). */
const WALL_EQUIVALENT: ReadonlySet<CountLabel> = new Set(["until_wall", "unspecified"]);

/**
 * Is the count answer certain enough to act on? A split between labels that
 * move identically (until_wall vs unspecified) is not real uncertainty.
 */
export function isCountConfident(cnt: ChoiceAnswer<CountLabel>): boolean {
  if (cnt.confidence >= CONF_TH) return true;
  if (!WALL_EQUIVALENT.has(cnt.choice)) return false;
  let p = 0;
  for (const label of WALL_EQUIVALENT) p += cnt.probabilities[label] ?? 0;
  return p >= GROUP_PROB_TH;
}

/** done: instructions used up / confused: could not understand / limit: MAX_STEPS reached. */
export type End = "done" | "confused" | "limit";

export type Decision = { kind: "end"; end: Exclude<End, "limit"> } | { kind: "step"; step: Step };

/** Apply the loop's end conditions (in priority order) to one Jev answer. */
export function decide(a: NextStepResponse): Decision {
  const dir = a.nextDirection;
  const cnt = a.nextCount;
  if (a.isDone >= DONE_TH) return { kind: "end", end: "done" };
  if (dir.choice === "none" || cnt.choice === "none") return { kind: "end", end: "done" };
  if (
    dir.choice === "unknown" ||
    cnt.choice === "unknown" ||
    dir.confidence < CONF_TH ||
    !isCountConfident(cnt)
  ) {
    return { kind: "end", end: "confused" };
  }
  if (!isDirection(dir.choice) || !isCount(cnt.choice)) return { kind: "end", end: "confused" };
  return { kind: "step", step: { direction: dir.choice, count: cnt.choice } };
}

export type AskNextStep = (utterance: string, parsedSteps: Step[]) => Promise<NextStepResponse>;

export type InterpretResult = { end: End; steps: Step[] };

/**
 * Ask Jev for one step at a time until an end condition holds.
 * `onStep` is called as soon as each step is decided so movement can start
 * while the next step is being interpreted.
 */
export async function interpret(
  utterance: string,
  ask: AskNextStep,
  onStep: (step: Step) => void,
): Promise<InterpretResult> {
  const steps: Step[] = [];
  for (let i = 0; i < MAX_STEPS; i++) {
    // Each question depends on the steps parsed so far, so requests are sequential by design.
    // oxlint-disable-next-line no-await-in-loop
    const d = decide(await ask(utterance, [...steps]));
    if (d.kind === "end") return { end: d.end, steps };
    steps.push(d.step);
    onStep(d.step);
  }
  return { end: "limit", steps };
}
