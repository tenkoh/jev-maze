import { describe, expect, it, vi } from "vitest";
import type { CountLabel, DirectionLabel, NextStepResponse, Step } from "../../shared/protocol";
import { type AskNextStep, decide, interpret } from "./interpret";

const answer = (
  direction: DirectionLabel,
  count: CountLabel,
  { isDone = 0.1, dirConf = 0.95, cntConf = 0.95 } = {},
): NextStepResponse => ({
  nextDirection: { choice: direction, confidence: dirConf, probabilities: {} as never },
  nextCount: { choice: count, confidence: cntConf, probabilities: {} as never },
  isDone,
  model: "test",
});

describe("decide", () => {
  it("returns a step for a confident answer", () => {
    expect(decide(answer("right", "3"))).toEqual({
      kind: "step",
      step: { direction: "right", count: "3" },
    });
  });

  it("prefers is_done over any other answer", () => {
    expect(decide(answer("unknown", "unknown", { isDone: 0.9 }))).toEqual({
      kind: "end",
      end: "done",
    });
  });

  it("ends as done when direction or count is none", () => {
    expect(decide(answer("none", "2"))).toEqual({ kind: "end", end: "done" });
    expect(decide(answer("right", "none"))).toEqual({ kind: "end", end: "done" });
    // none wins over unknown / low confidence (priority 2 before 3)
    expect(decide(answer("none", "unknown", { dirConf: 0.2 }))).toEqual({
      kind: "end",
      end: "done",
    });
  });

  it("ends as confused on unknown or low confidence", () => {
    expect(decide(answer("unknown", "2"))).toEqual({ kind: "end", end: "confused" });
    expect(decide(answer("right", "unknown"))).toEqual({ kind: "end", end: "confused" });
    expect(decide(answer("right", "2", { dirConf: 0.5 }))).toEqual({
      kind: "end",
      end: "confused",
    });
    expect(decide(answer("right", "2", { cntConf: 0.69 }))).toEqual({
      kind: "end",
      end: "confused",
    });
  });
});

describe("decide: until_wall threshold", () => {
  it("accepts until_wall at a lower confidence", () => {
    expect(decide(answer("right", "until_wall", { cntConf: 0.62 }))).toEqual({
      kind: "step",
      step: { direction: "right", count: "until_wall" },
    });
  });

  it("still rejects until_wall below its threshold", () => {
    expect(decide(answer("right", "until_wall", { cntConf: 0.59 }))).toEqual({
      kind: "end",
      end: "confused",
    });
  });

  it("keeps the normal threshold for other counts and for the direction", () => {
    expect(decide(answer("right", "2", { cntConf: 0.62 }))).toEqual({
      kind: "end",
      end: "confused",
    });
    expect(decide(answer("right", "until_wall", { dirConf: 0.62 }))).toEqual({
      kind: "end",
      end: "confused",
    });
  });
});

describe("interpret", () => {
  it("emits steps in order and passes the growing parsed list", async () => {
    const script = [answer("right", "3"), answer("up", "until_wall"), answer("none", "none")];
    const seen: Step[][] = [];
    const ask = vi.fn<AskNextStep>(async (_u: string, parsed: Step[]) => {
      seen.push(parsed);
      const next = script.shift();
      if (!next) throw new Error("asked too many times");
      return next;
    });
    const onStep = vi.fn<(step: Step) => void>();

    const result = await interpret("右に3マス、左に曲がって突き当たりまで", ask, onStep);

    expect(result).toEqual({
      end: "done",
      steps: [
        { direction: "right", count: "3" },
        { direction: "up", count: "until_wall" },
      ],
    });
    expect(onStep).toHaveBeenCalledTimes(2);
    expect(seen.map((s) => s.length)).toEqual([0, 1, 2]);
  });

  it("does not execute the step that caused confusion", async () => {
    const script = [answer("right", "2"), answer("down", "2", { dirConf: 0.3 })];
    const onStep = vi.fn<(step: Step) => void>();
    const result = await interpret(
      "x",
      async () => script.shift() ?? answer("none", "none"),
      onStep,
    );
    expect(result.end).toBe("confused");
    expect(result.steps).toEqual([{ direction: "right", count: "2" }]);
    expect(onStep).toHaveBeenCalledTimes(1);
  });

  it("stops at MAX_STEPS", async () => {
    const ask = vi.fn<AskNextStep>(async () => answer("right", "1"));
    const result = await interpret("x", ask, () => {});
    expect(result.end).toBe("limit");
    expect(result.steps).toHaveLength(5);
    expect(ask).toHaveBeenCalledTimes(5);
  });

  it("propagates API failures", async () => {
    await expect(
      interpret(
        "x",
        async () => {
          throw new Error("boom");
        },
        () => {},
      ),
    ).rejects.toThrow("boom");
  });
});
