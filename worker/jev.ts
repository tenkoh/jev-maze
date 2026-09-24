import { choice, noul, type TypeSafeClient } from "@typesafe-ai/sdk";
import type { NextStepResponse, Step } from "../shared/protocol";

/**
 * State for one "what is the next step?" request. The maze layout, walls and
 * goal are intentionally NOT included: Jev must translate the utterance
 * faithfully, not solve the maze.
 */
export function buildState(utterance: string, parsedSteps: readonly Step[]) {
  const last = parsedSteps.at(-1);
  return {
    utterance,
    parsed_steps: parsedSteps.map((s) => ({ direction: s.direction, count: s.count })),
    // Counting is done in code; the model only needs to locate that movement.
    next_step_number: parsedSteps.length + 1,
    // Only used for まっすぐ / そのまま without a direction word.
    previous_direction: last ? last.direction : null,
  };
}

const NEXT_STEP_TASK =
  "`utterance` is a Japanese spoken instruction that moves a character on a top-down maze shown on screen. " +
  "`parsed_steps` lists, in spoken order, the movements already taken from `utterance`. " +
  "The next step is movement number `next_step_number` in `utterance`, counting movements in spoken order " +
  "(a self-correction replaces the movement it corrects). Only that movement matters; ignore the others.";

/** How to find movement N; used for the direction, where picking the wrong movement is the main error. */
const SEGMENT_RULE =
  "Movement 1 starts at the first direction word (上, 下, 左, 右, ...) in `utterance`; each later direction word starts the next movement, " +
  "except when it corrects the previous one (いや, じゃなくて). A phrase such as 分かれ道まで or 行けるところまで belongs to the movement before it.";

export const QUESTIONS = {
  next_direction: choice(
    {
      task: NEXT_STEP_TASK,
      question: "Which way on the screen does that next movement go?",
      rules: [
        SEGMENT_RULE,
        "Every direction word means a direction on the screen. The character has no facing, so 曲がる / 曲がって / 折れる / 右折 / 左折 do not change the meaning: 右に曲がって = right, 下に曲がって = down.",
        "A movement with no direction word (まっすぐ, そのまま) continues `previous_direction`; if `previous_direction` is null, the direction is unknown.",
        "If the speaker corrects themselves (いや, じゃなくて, 間違えた), use the corrected direction.",
      ],
    },
    {
      up: "Up on the screen: 上, 上に曲がる, 北.",
      down: "Down on the screen: 下, 下に曲がる, 南.",
      left: "Left on the screen: 左, 左側, 左に曲がる, 左折, 西.",
      right: "Right on the screen: 右, 右側, 右に曲がる, 右折, 東.",
      none: "Every movement in `utterance` is already in `parsed_steps`; there is no next movement.",
      unknown:
        "There is a next movement, but its direction cannot be determined (unclear, contradictory, or not a movement).",
    },
  ),
  next_count: choice(
    {
      task: NEXT_STEP_TASK,
      question: "How far does `utterance` say that next movement should go?",
      rules: [
        "The distance of a movement is the phrase right after its direction word, before the next direction. Example: in 右に進んで下に曲がって分かれ道まで, movement 1 (右に進んで) has no distance and movement 2 (下に曲がって分かれ道まで) goes until_junction.",
        "Judge only movement number `next_step_number`; the distances of earlier movements do not matter.",
        "Numbers may be written as digits, kanji or kana: 2, 二, に, ふた all mean 2.",
      ],
    },
    {
      "1": "Exactly one cell (1マス, 一マス, いちマス, ひとマス, 1つ, 一歩).",
      "2": "Exactly two cells (2マス, 二マス, にマス, ふたマス, 2つ).",
      "3": "Exactly three cells (3マス, 三マス, さんマス, 3つ).",
      "4": "Four or more cells (4マス, 5マス, ...).",
      until_wall:
        "Until the wall / as far as possible (突き当たりまで, 突き当たり, 行き止まりまで, 壁まで, 端まで, ずっと, 行けるところまで). Also まっすぐ with no number (右にまっすぐ, まっすぐ行って); まっすぐ2マス is 2, not until_wall.",
      until_junction:
        "Until the next branch or intersection (次の分かれ道まで, 分かれ道まで, 分岐まで, 交差点まで, 曲がり角まで).",
      unspecified:
        "That movement names a direction but says nothing about distance (右へ進んで, 下に行って, just 右). Not used when a number, a stopping point such as 分かれ道, or まっすぐ is mentioned for it.",
      none: "Every movement in `utterance` is already in `parsed_steps`; there is no next movement.",
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
