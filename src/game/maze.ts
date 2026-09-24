import { DIRECTIONS, type Direction, type Step } from "../../shared/protocol";

export type Cell = 0 | 1; // 0 = path, 1 = wall
export type Pos = { x: number; y: number };

export type Maze = {
  id: string;
  size: number;
  grid: Cell[][]; // grid[y][x]
  start: Pos;
  goal: Pos;
};

export const DELTA: Record<Direction, readonly [number, number]> = {
  north: [0, -1],
  east: [1, 0],
  south: [0, 1],
  west: [-1, 0],
};

export const samePos = (a: Pos, b: Pos): boolean => a.x === b.x && a.y === b.y;

export const canEnter = (m: Maze, x: number, y: number): boolean =>
  x >= 0 && y >= 0 && x < m.size && y < m.size && m.grid[y]?.[x] === 0;

const next = (p: Pos, d: Direction): Pos => ({ x: p.x + DELTA[d][0], y: p.y + DELTA[d][1] });

export const openNeighborCount = (m: Maze, p: Pos): number =>
  DIRECTIONS.filter((d) => {
    const n = next(p, d);
    return canEnter(m, n.x, n.y);
  }).length;

/** A junction is a path cell with three or more open neighbors. */
export const isJunction = (m: Maze, p: Pos): boolean => openNeighborCount(m, p) >= 3;

/**
 * Cells visited when executing `step` from `from` (excluding `from`).
 * Movement stops in front of a wall or the maze edge.
 */
export function pathForStep(m: Maze, from: Pos, step: Step): Pos[] {
  const path: Pos[] = [];
  let cur = from;
  const limit =
    step.count === "until_wall" || step.count === "until_junction" || step.count === "unspecified"
      ? Number.POSITIVE_INFINITY
      : Number(step.count);
  while (path.length < limit) {
    const n = next(cur, step.direction);
    if (!canEnter(m, n.x, n.y)) break;
    path.push(n);
    cur = n;
    if (step.count === "until_junction" && isJunction(m, cur)) break;
  }
  return path;
}

/** Parse a maze from rows like "S..#." where S/G mark start and goal, # is a wall. */
export function parseMaze(id: string, rows: readonly string[]): Maze {
  const size = rows.length;
  let start: Pos | undefined;
  let goal: Pos | undefined;
  const grid = rows.map((row, y) => {
    if (row.length !== size) throw new Error(`maze ${id}: row ${y} must have ${size} cells`);
    return [...row].map((ch, x): Cell => {
      if (ch === "S") start = { x, y };
      else if (ch === "G") goal = { x, y };
      else if (ch !== "." && ch !== "#") throw new Error(`maze ${id}: bad cell '${ch}'`);
      return ch === "#" ? 1 : 0;
    });
  });
  if (!start || !goal) throw new Error(`maze ${id}: needs both S and G`);
  return { id, size, grid, start, goal };
}

const stateKey = (p: Pos, d: Direction) => `${p.x},${p.y},${d}`;

/**
 * Fewest spoken instructions needed to reach the goal, or null if unreachable.
 * State is (cell, heading); continuing straight costs 0, starting or changing
 * direction costs 1 (0-1 BFS). Stopping anywhere is allowed (numeric counts).
 */
export function minInstructions(m: Maze): number | null {
  const dist = new Map<string, number>();
  const deque: { p: Pos; d: Direction; c: number }[] = [];
  for (const d of DIRECTIONS) {
    const n = next(m.start, d);
    if (!canEnter(m, n.x, n.y)) continue;
    dist.set(stateKey(n, d), 1);
    deque.push({ p: n, d, c: 1 });
  }
  while (deque.length > 0) {
    const cur = deque.shift();
    if (!cur) break;
    if (cur.c > (dist.get(stateKey(cur.p, cur.d)) ?? Number.POSITIVE_INFINITY)) continue;
    if (samePos(cur.p, m.goal)) return cur.c;
    for (const d of DIRECTIONS) {
      const n = next(cur.p, d);
      if (!canEnter(m, n.x, n.y)) continue;
      const c = cur.c + (d === cur.d ? 0 : 1);
      if (c >= (dist.get(stateKey(n, d)) ?? Number.POSITIVE_INFINITY)) continue;
      dist.set(stateKey(n, d), c);
      if (c === cur.c) deque.unshift({ p: n, d, c });
      else deque.push({ p: n, d, c });
    }
  }
  return null;
}
