import { describe, expect, it } from "vitest";
import { listenStartOffset } from "./countdown";

describe("listenStartOffset", () => {
  it("starts `lead` ms before the countdown ends", () => {
    expect(listenStartOffset(3000, 500)).toBe(2500);
  });

  it("clamps to the countdown window", () => {
    expect(listenStartOffset(3000, 0)).toBe(3000);
    expect(listenStartOffset(3000, 5000)).toBe(0);
    expect(listenStartOffset(3000, -100)).toBe(3000);
    expect(listenStartOffset(3000, Number.NaN)).toBe(3000);
  });
});
