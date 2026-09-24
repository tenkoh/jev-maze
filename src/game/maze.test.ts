import { describe, expect, it } from "vitest";
import { isJunction, minInstructions, parseMaze, pathForStep } from "./maze";

// . . . . .
// . # . # .
// S . . . G
// . # # # .
// . . . . .
const maze = parseMaze("t", [".....", ".#.#.", "S...G", ".###.", "....."]);

describe("parseMaze", () => {
  it("reads start, goal and walls", () => {
    expect(maze.start).toEqual({ x: 0, y: 2 });
    expect(maze.goal).toEqual({ x: 4, y: 2 });
    expect(maze.grid[1]?.[1]).toBe(1);
    expect(maze.grid[2]?.[4]).toBe(0);
  });

  it("rejects malformed mazes", () => {
    expect(() => parseMaze("x", ["S..", "...", "..."])).toThrow(/needs both/);
    expect(() => parseMaze("x", ["S.", "..G"])).toThrow(/row 1/);
    expect(() => parseMaze("x", ["S.?", "...", "..G"])).toThrow(/bad cell/);
  });
});

describe("pathForStep", () => {
  it("moves a numeric count of cells", () => {
    expect(pathForStep(maze, maze.start, { direction: "right", count: "2" })).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
  });

  it("stops in front of a wall when the count is too large", () => {
    expect(pathForStep(maze, { x: 1, y: 2 }, { direction: "up", count: "3" })).toEqual([]);
    expect(pathForStep(maze, maze.start, { direction: "up", count: "4" })).toEqual([
      { x: 0, y: 1 },
      { x: 0, y: 0 },
    ]);
  });

  it("goes until the wall or the edge", () => {
    const path = pathForStep(maze, maze.start, { direction: "right", count: "until_wall" });
    expect(path.at(-1)).toEqual({ x: 4, y: 2 });
    expect(path).toHaveLength(4);
  });

  it("treats an unspecified count like until_wall", () => {
    expect(pathForStep(maze, maze.start, { direction: "right", count: "unspecified" })).toEqual(
      pathForStep(maze, maze.start, { direction: "right", count: "until_wall" }),
    );
  });

  it("stops at the next junction", () => {
    // (2,2) has neighbors left, right and up open -> junction.
    expect(isJunction(maze, { x: 2, y: 2 })).toBe(true);
    expect(pathForStep(maze, maze.start, { direction: "right", count: "until_junction" })).toEqual([
      { x: 1, y: 2 },
      { x: 2, y: 2 },
    ]);
  });

  it("does not stop on the starting cell even if it is a junction", () => {
    const path = pathForStep(maze, { x: 2, y: 2 }, { direction: "right", count: "until_junction" });
    // (3,2) has only left/right open; (4,2) has left, up, down -> junction.
    expect(path.at(-1)).toEqual({ x: 4, y: 2 });
  });

  it("walks to the wall when there is no junction ahead", () => {
    const path = pathForStep(maze, { x: 0, y: 4 }, { direction: "right", count: "until_junction" });
    expect(path.at(-1)).toEqual({ x: 4, y: 4 });
  });
});

describe("minInstructions", () => {
  it("counts direction changes, not cells", () => {
    expect(minInstructions(maze)).toBe(1);
    const turn = parseMaze("t2", ["S..", "##.", "..G"]);
    expect(minInstructions(turn)).toBe(2);
  });

  it("returns null when the goal is unreachable", () => {
    expect(minInstructions(parseMaze("t3", ["S#.", "##.", "..G"]))).toBeNull();
  });
});
