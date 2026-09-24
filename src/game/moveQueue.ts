import type { Direction, Step } from "../../shared/protocol";
import { type Maze, type Pos, pathForStep } from "./maze";

export type MoveEvents = {
  /** The character entered `pos` (one call per cell). */
  onMove: (pos: Pos, direction: Direction) => void;
  /** A step could not move even one cell (blocked immediately). */
  onBump?: (direction: Direction) => void;
  /** Number of steps queued but not yet fully animated. */
  onPendingChange?: (pending: number) => void;
};

const defaultSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Serializes step animations. Paths are computed at enqueue time from the
 * position the previous steps will end at, so interpretation can run ahead.
 */
export class MoveQueue {
  #planned: Pos;
  #chain: Promise<void> = Promise.resolve();
  #pending = 0;
  #cancelled = false;

  constructor(
    private readonly maze: Maze,
    start: Pos,
    private readonly events: MoveEvents,
    private readonly cellMs: number,
    private readonly sleep: (ms: number) => Promise<void> = defaultSleep,
  ) {
    this.#planned = start;
  }

  /** Where the character will be once every queued step has run. */
  get finalPosition(): Pos {
    return this.#planned;
  }

  enqueue(step: Step): Pos[] {
    const path = pathForStep(this.maze, this.#planned, step);
    this.#planned = path.at(-1) ?? this.#planned;
    this.#setPending(this.#pending + 1);
    this.#chain = this.#chain.then(async () => {
      if (path.length === 0) {
        if (!this.#cancelled) this.events.onBump?.(step.direction);
        await this.sleep(this.cellMs);
      }
      for (const pos of path) {
        if (this.#cancelled) return;
        this.events.onMove(pos, step.direction);
        // One cell per tick is the animation itself.
        // oxlint-disable-next-line no-await-in-loop
        await this.sleep(this.cellMs);
      }
      this.#setPending(this.#pending - 1);
    });
    return path;
  }

  /** Resolves when every queued step has finished animating. */
  drain(): Promise<void> {
    return this.#chain;
  }

  cancel(): void {
    this.#cancelled = true;
  }

  #setPending(n: number) {
    this.#pending = n;
    if (!this.#cancelled) this.events.onPendingChange?.(n);
  }
}
