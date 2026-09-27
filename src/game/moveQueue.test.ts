import { describe, expect, it, vi } from "vitest";
import { parseMaze, type Pos } from "./maze";
import { type MoveEvents, MoveQueue } from "./moveQueue";

const maze = parseMaze("q", ["S...#", "#.#..", "....G", ".....", "....."]);
const noSleep = () => Promise.resolve();

describe("MoveQueue", () => {
  it("animates queued steps in order, cell by cell", async () => {
    const moves: Pos[] = [];
    const q = new MoveQueue(maze, maze.start, { onMove: (p) => moves.push(p) }, 0, noSleep);

    q.enqueue({ direction: "right", count: "until_wall" });
    q.enqueue({ direction: "down", count: "2" });
    await q.drain();

    expect(moves).toEqual([
      { x: 1, y: 0 },
      { x: 2, y: 0 },
      { x: 3, y: 0 },
      { x: 3, y: 1 },
      { x: 3, y: 2 },
    ]);
    expect(q.finalPosition).toEqual({ x: 3, y: 2 });
  });

  it("plans ahead of the animation", () => {
    const q = new MoveQueue(maze, maze.start, { onMove: () => {} }, 0, () => new Promise(() => {}));
    q.enqueue({ direction: "right", count: "1" });
    expect(q.enqueue({ direction: "down", count: "1" })).toEqual([{ x: 1, y: 1 }]);
    expect(q.finalPosition).toEqual({ x: 1, y: 1 });
  });

  it("reports a bump when blocked immediately", async () => {
    const onBump = vi.fn<NonNullable<MoveEvents["onBump"]>>();
    const q = new MoveQueue(maze, maze.start, { onMove: () => {}, onBump }, 0, noSleep);
    q.enqueue({ direction: "up", count: "1" });
    await q.drain();
    expect(onBump).toHaveBeenCalledWith("up");
    expect(q.finalPosition).toEqual(maze.start);
  });

  it("tracks pending steps", async () => {
    const pending: number[] = [];
    const q = new MoveQueue(
      maze,
      maze.start,
      { onMove: () => {}, onPendingChange: (n) => pending.push(n) },
      0,
      noSleep,
    );
    q.enqueue({ direction: "right", count: "1" });
    q.enqueue({ direction: "right", count: "1" });
    await q.drain();
    expect(pending).toEqual([1, 2, 1, 0]);
  });

  it("stops emitting after cancel", async () => {
    const onMove = vi.fn<MoveEvents["onMove"]>();
    const q = new MoveQueue(maze, maze.start, { onMove }, 0, noSleep);
    q.cancel();
    q.enqueue({ direction: "right", count: "3" });
    await q.drain();
    expect(onMove).not.toHaveBeenCalled();
  });
});
