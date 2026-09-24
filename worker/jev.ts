import { choice, noul, type TypeSafeClient } from "@typesafe-ai/sdk";
import {
  currentFacing,
  START_FACING,
  type Step,
  turnBack,
  turnLeft,
  turnRight,
  type NextStepResponse,
} from "../shared/protocol";

/**
 * State for one "what is the next step?" request. The maze layout, walls and
 * goal are intentionally NOT included: Jev must translate the utterance
 * faithfully, not solve the maze.
 */
export function buildState(utterance: string, parsedSteps: readonly Step[]) {
  const facing = currentFacing(parsedSteps);
  return {
    map_convention:
      "Top-down maze. On screen: up = north, down = south, right = east, left = west.",
    start_facing: START_FACING,
    utterance,
    parsed_steps: parsedSteps.map((s) => ({ direction: s.direction, count: s.count })),
    // Counting is done in code; the model only needs to locate that movement.
    next_step_number: parsedSteps.length + 1,
    current_facing: facing,
    // Relative turns resolved by code so the model only has to look them up.
    turns_from_current_facing: {
      turn_right: turnRight(facing),
      turn_left: turnLeft(facing),
      go_straight: facing,
      turn_around: turnBack(facing),
    },
  };
}

const NEXT_STEP_TASK =
  "`utterance` is a Japanese spoken instruction that moves a character through a top-down maze. " +
  "`parsed_steps` lists, in spoken order, the movement steps already taken from `utterance`. " +
  "The next step is movement number `next_step_number` in `utterance`, counting movements in spoken order " +
  "(a self-correction replaces the movement it corrects). Only that movement matters; ignore the others.";

export const QUESTIONS = {
  next_direction: choice(
    {
      task: NEXT_STEP_TASK,
      question: "What absolute direction does that next step move in?",
      rules: [
        "Without a turning verb, a direction word is a screen direction: 右 = east, 左 = west, 上 = north, 下 = south (also 東/西/北/南). Examples: 右へ2マス = east, 右に分かれ道まで = east, 左に行って = west.",
        "Only with a turning verb (曲がる, 曲がって, 折れる, 右折, 左折, Uターン, 引き返す) is the direction relative to `current_facing`; read it from `turns_from_current_facing`. Example: 右に曲がって = `turns_from_current_facing.turn_right`.",
        "まっすぐ / そのまま進む without a new direction means `turns_from_current_facing.go_straight`.",
        "If the speaker corrects themselves (いや, じゃなくて, 間違えた), use the corrected instruction.",
      ],
    },
    {
      north: "The next step moves north (up on screen).",
      east: "The next step moves east (right on screen).",
      south: "The next step moves south (down on screen).",
      west: "The next step moves west (left on screen).",
      none: "Every movement in `utterance` is already in `parsed_steps`; there is no next step.",
      unknown:
        "There is a next step, but its direction cannot be determined from `utterance` (unclear, contradictory, or not a movement).",
    },
  ),
  next_count: choice(
    {
      task: NEXT_STEP_TASK,
      question: "How far does `utterance` say that next step should move?",
      rules: [
        "The distance of a movement is the phrase right after its direction word or turning verb, before the next direction. Example: in 下に行って右に曲がって分かれ道まで, movement 1 (下に行って) has no distance and movement 2 (右に曲がって分かれ道まで) goes until_junction.",
        "Judge only movement number `next_step_number`; the distances of earlier movements do not matter.",
      ],
    },
    {
      "1": "Exactly one cell (1マス, ひとマス, 一つ, 一歩).",
      "2": "Exactly two cells (2マス, ふたマス, 二つ).",
      "3": "Exactly three cells (3マス, みマス, 三つ).",
      "4": "Four or more cells (4マス, 5マス, ...).",
      until_wall:
        "Until the wall / as far as possible (突き当たりまで, 突き当たり, 行き止まりまで, 壁まで, 端まで, ずっと, 行けるところまで).",
      until_junction:
        "Until the next branch or intersection (次の分かれ道まで, 分岐まで, 交差点まで, 曲がり角まで).",
      unspecified:
        "That movement names a direction but says nothing about distance (右へ進んで, 下に行って). Not used when a distance or a stopping point such as 分かれ道 is mentioned for it.",
      none: "Every movement in `utterance` is already in `parsed_steps`; there is no next step.",
      unknown: "A distance is mentioned but cannot be understood.",
    },
  ),
  is_done: noul(
    "Does `parsed_steps` already contain every movement instruction spoken in `utterance`, so that nothing is left to execute?",
    {
      true: "All movements in `utterance` are already listed in `parsed_steps`, or `utterance` contains no movement at all.",
      false:
        "At least one movement in `utterance` is not yet in `parsed_steps` (an empty `parsed_steps` covers nothing).",
    },
  ),
};

export async function askNextStep(
  client: Pick<TypeSafeClient, "systemOne">,
  utterance: string,
  parsedSteps: readonly Step[],
  signal?: AbortSignal,
): Promise<NextStepResponse> {
  const res = await client.systemOne(
    { state: buildState(utterance, parsedSteps), questions: QUESTIONS },
    signal ? { signal } : {},
  );
  const { next_direction, next_count, is_done } = res.answers;
  return {
    nextDirection: {
      choice: next_direction.choice,
      confidence: next_direction.confidence,
      probabilities: { ...next_direction.probabilities },
    },
    nextCount: {
      choice: next_count.choice,
      confidence: next_count.confidence,
      probabilities: { ...next_count.probabilities },
    },
    isDone: is_done.noul,
    model: res.model,
  };
}
