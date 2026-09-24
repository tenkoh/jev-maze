import { describe, expect, it, vi } from "vitest";
import type { NextStepResponse } from "../shared/protocol";
import { createApp, parseNextStepRequest } from "./index";

type SystemOne = (req: { state: { utterance: string } }, opts?: unknown) => Promise<unknown>;
import { buildState, QUESTIONS } from "./jev";

const fakeAnswers = {
  model: "jev-test",
  answers: {
    next_direction: {
      type: "choice",
      choice: "east",
      confidence: 0.9,
      probabilities: { east: 0.95, north: 0.05 },
    },
    next_count: {
      type: "choice",
      choice: "3",
      confidence: 0.85,
      probabilities: { "3": 0.9, "2": 0.1 },
    },
    is_done: { type: "noul", noul: 0.02 },
  },
  usage: { input_tokens: 1, output_tokens: 1 },
};

const post = (app: ReturnType<typeof createApp>, body: unknown, env = { TYPESAFE_API_KEY: "k" }) =>
  app.request(
    "/api/next-step",
    { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } },
    env,
  );

describe("buildState", () => {
  it("derives current_facing and turns from the last step", () => {
    const s = buildState("右に3マス、左に曲がって", [{ direction: "east", count: "3" }]);
    expect(s.current_facing).toBe("east");
    expect(s.turns_from_current_facing).toEqual({
      turn_right: "south",
      turn_left: "north",
      go_straight: "east",
      turn_around: "west",
    });
  });

  it("uses start_facing when nothing is parsed yet", () => {
    const s = buildState("上へ", []);
    expect(s.current_facing).toBe(s.start_facing);
  });

  it("never leaks maze layout into the state", () => {
    const keys = Object.keys(buildState("x", []));
    expect(keys).not.toContain("grid");
    expect(keys).not.toContain("goal");
  });
});

describe("QUESTIONS", () => {
  it("offers none/unknown on both choices", () => {
    expect(Object.keys(QUESTIONS.next_direction.criteria)).toEqual(
      expect.arrayContaining(["north", "east", "south", "west", "none", "unknown"]),
    );
    expect(Object.keys(QUESTIONS.next_count.criteria)).toEqual(
      expect.arrayContaining([
        "1",
        "4",
        "until_wall",
        "until_junction",
        "unspecified",
        "none",
        "unknown",
      ]),
    );
  });
});

describe("parseNextStepRequest", () => {
  it("accepts a valid body", () => {
    expect(parseNextStepRequest({ utterance: "右", parsedSteps: [] })).toEqual({
      utterance: "右",
      parsedSteps: [],
    });
  });

  it.each([
    [null, /object/],
    [{ utterance: 1, parsedSteps: [] }, /utterance/],
    [{ utterance: "x".repeat(201), parsedSteps: [] }, /too long/],
    [{ utterance: "x", parsedSteps: "no" }, /parsedSteps/],
    [{ utterance: "x", parsedSteps: [{ direction: "up", count: "1" }] }, /invalid step/],
    [
      {
        utterance: "x",
        parsedSteps: Array.from({ length: 5 }, () => ({ direction: "east", count: "1" })),
      },
      /shorter/,
    ],
  ])("rejects %j", (body, msg) => {
    expect(parseNextStepRequest(body)).toMatch(msg);
  });
});

describe("POST /api/next-step", () => {
  it("returns Jev's judgments", async () => {
    const systemOne = vi.fn<SystemOne>().mockResolvedValue(fakeAnswers);
    const app = createApp(() => ({ systemOne }) as never);
    const res = await post(app, { utterance: "右に3マス", parsedSteps: [] });
    expect(res.status).toBe(200);
    const body = (await res.json()) as NextStepResponse;
    expect(body.nextDirection.choice).toBe("east");
    expect(body.nextCount.choice).toBe("3");
    expect(body.isDone).toBe(0.02);
    expect(systemOne.mock.calls[0]?.[0].state.utterance).toBe("右に3マス");
  });

  it("rejects invalid input without calling Jev", async () => {
    const systemOne = vi.fn<SystemOne>();
    const app = createApp(() => ({ systemOne }) as never);
    const res = await post(app, { utterance: 3 });
    expect(res.status).toBe(400);
    expect(systemOne).not.toHaveBeenCalled();
  });

  it("fails clearly when the API key is missing", async () => {
    const app = createApp(() => ({ systemOne: vi.fn<SystemOne>() }) as never);
    const res = await post(app, { utterance: "x", parsedSteps: [] }, {} as never);
    expect(res.status).toBe(500);
  });

  it("maps upstream failures to 502", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const app = createApp(
      () => ({ systemOne: vi.fn<SystemOne>().mockRejectedValue(new Error("x")) }) as never,
    );
    const res = await post(app, { utterance: "x", parsedSteps: [] });
    expect(res.status).toBe(502);
  });
});
