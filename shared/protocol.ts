// Types shared by the browser app and the Worker API.

export const DIRECTIONS = ["up", "right", "down", "left"] as const;
export type Direction = (typeof DIRECTIONS)[number];

// A movement with no distance goes until the wall, so it is reported as until_wall.
export const COUNTS = ["1", "2", "3", "4", "until_wall", "until_junction"] as const;
export type Count = (typeof COUNTS)[number];

/** One movement step extracted from the utterance. */
export type Step = { direction: Direction; count: Count };

/** Extra labels a Choice can return besides a movable value. */
export type Terminal = "none" | "unknown";

export type DirectionLabel = Direction | Terminal;
export type CountLabel = Count | Terminal;

export type ChoiceAnswer<L extends string> = {
  choice: L;
  confidence: number;
  probabilities: Record<L, number>;
};

/** POST /api/next-step request body. */
export type NextStepRequest = {
  utterance: string;
  parsedSteps: Step[];
};

/** POST /api/next-step response body: Jev's raw judgments, policy is applied by the caller. */
export type NextStepResponse = {
  nextDirection: ChoiceAnswer<DirectionLabel>;
  nextCount: ChoiceAnswer<CountLabel>;
  isDone: number;
  model: string;
};

export const MAX_UTTERANCE_LENGTH = 200;
export const MAX_STEPS = 5;

export const isDirection = (v: unknown): v is Direction =>
  typeof v === "string" && (DIRECTIONS as readonly string[]).includes(v);

export const isCount = (v: unknown): v is Count =>
  typeof v === "string" && (COUNTS as readonly string[]).includes(v);

export const isStep = (v: unknown): v is Step =>
  typeof v === "object" &&
  v !== null &&
  isDirection((v as Record<string, unknown>)["direction"]) &&
  isCount((v as Record<string, unknown>)["count"]);
