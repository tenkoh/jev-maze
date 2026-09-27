import { describe, expect, it } from "vitest";
import { minInstructions } from "./maze";
import { findStage, pickStage, STAGES } from "./stages";

describe("STAGES", () => {
  it.each(STAGES.map((s) => [s.id, s] as const))(
    "%s is 5x5 and solvable in 2-3 instructions",
    (_id, stage) => {
      expect(stage.size).toBe(5);
      const n = minInstructions(stage);
      expect(n).not.toBeNull();
      expect(n).toBeGreaterThanOrEqual(2);
      expect(n).toBeLessThanOrEqual(3);
    },
  );

  it("has unique ids", () => {
    expect(new Set(STAGES.map((s) => s.id)).size).toBe(STAGES.length);
  });
});

describe("pickStage / findStage", () => {
  it("avoids the excluded stage", () => {
    const first = STAGES[0];
    expect(first).toBeDefined();
    for (let i = 0; i < 20; i++) {
      expect(pickStage(() => 0, first?.id).id).not.toBe(first?.id);
    }
  });

  it("finds a stage by id", () => {
    expect(findStage("stage-2")?.id).toBe("stage-2");
    expect(findStage("nope")).toBeUndefined();
    expect(findStage(null)).toBeUndefined();
  });
});
