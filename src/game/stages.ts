import { type Maze, parseMaze } from "./maze";

// Predefined stages. "S" start, "G" goal, "#" wall, "." path.
// Every stage must be solvable in 2–3 spoken instructions (checked in stages.test.ts).
const STAGE_ROWS: readonly (readonly string[])[] = [
  ["S....", ".#...", "...#.", "#.#..", "..#.G"],
  ["S...#", ".#..G", "...#.", ".#.#.", ".##.."],
  ["S....", "..#.#", "###.#", "#...G", "..#.."],
  ["S..#.", ".....", "##...", "..#.G", "##.#."],
  ["##S..", "###..", "..#..", "#...G", ".#..."],
  ["G....", "....#", "....S", "###..", "#.#.#"],
  ["..G#.", ".....", "..##.", "...#S", "..###"],
  [".#.#.", "S....", ".###G", ".#.#.", "#...."],
];

export const STAGES: readonly Maze[] = STAGE_ROWS.map((rows, i) =>
  parseMaze(`stage-${i + 1}`, rows),
);

/** Pick a random stage, avoiding `exceptId` when possible. */
export function pickStage(random: () => number = Math.random, exceptId?: string): Maze {
  const pool = STAGES.filter((s) => s.id !== exceptId);
  const list = pool.length > 0 ? pool : STAGES;
  const stage = list[Math.floor(random() * list.length)] ?? list[0];
  if (!stage) throw new Error("no stages defined");
  return stage;
}

export const findStage = (id: string | null): Maze | undefined =>
  id === null ? undefined : STAGES.find((s) => s.id === id);
