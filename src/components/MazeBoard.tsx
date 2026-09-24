import type { ReactNode } from "react";
import { type Maze, type Pos, samePos } from "../game/maze";
import { Robot, type RobotPose } from "./Robot";

const CELL = 100;
const PAD = 16;

type Props = {
  maze: Maze;
  robot: Pos;
  pose: RobotPose;
  cellMs: number;
  /** Hide walls vs. paths (S, G and the robot stay visible). */
  hidden?: boolean;
  overlay?: ReactNode;
};

/** Per-tile delay of the reveal wave, starting at S; the whole wave stays under ~0.25s. */
const REVEAL_STEP_MS = 10;

export function MazeBoard({ maze, robot, pose, cellMs, hidden = false, overlay }: Props) {
  const size = maze.size * CELL + PAD * 2;
  const cells = maze.grid.flatMap((row, y) =>
    row.map((cell, x) => {
      const isStart = x === maze.start.x && y === maze.start.y;
      const isGoal = x === maze.goal.x && y === maze.goal.y;
      const actual = cell === 1 ? "wall" : isStart ? "start" : isGoal ? "goal" : "path";
      const faceDown = hidden && (actual === "wall" || actual === "path");
      const kind = faceDown ? "covered" : actual;
      const distance = Math.abs(x - maze.start.x) + Math.abs(y - maze.start.y);
      // When the robot stands on S/G, tuck the label into the corner so it stays visible.
      const tucked = samePos(robot, { x, y });
      return { x, y, kind, distance, tucked, label: isStart ? "S" : isGoal ? "G" : "" };
    }),
  );

  return (
    <div className={`board ${hidden ? "board--hidden" : "board--revealed"}`}>
      <svg
        viewBox={`0 0 ${size} ${size}`}
        role="img"
        aria-label={`迷路 ${maze.id}`}
        className="board__svg"
      >
        <rect width={size} height={size} rx="18" className="board__frame" />
        {cells.map((c) => (
          <g key={`${c.x}-${c.y}`} data-cell={c.kind}>
            <rect
              x={PAD + c.x * CELL}
              y={PAD + c.y * CELL}
              width={CELL}
              height={CELL}
              className={`cell cell--${c.kind}`}
              style={{ animationDelay: `${c.distance * REVEAL_STEP_MS}ms` }}
            />
            {c.label && (
              <text
                x={PAD + c.x * CELL + (c.tucked ? 16 : CELL / 2)}
                y={PAD + c.y * CELL + (c.tucked ? 29 : CELL / 2 + 16)}
                textAnchor="middle"
                className={`cell__label cell__label--${c.kind}`}
                fontSize={c.tucked ? 24 : 46}
              >
                {c.label}
              </text>
            )}
          </g>
        ))}
        <g
          className="board__robot"
          data-x={robot.x}
          data-y={robot.y}
          style={{
            transform: `translate(${PAD + robot.x * CELL}px, ${PAD + robot.y * CELL}px)`,
            transitionDuration: `${cellMs}ms`,
          }}
        >
          <Robot pose={pose} />
        </g>
      </svg>
      {overlay && <div className="board__overlay">{overlay}</div>}
    </div>
  );
}
