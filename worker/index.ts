import { APIError, TypeSafeClient } from "@typesafe-ai/sdk";
import { Hono } from "hono";
import { isStep, MAX_STEPS, MAX_UTTERANCE_LENGTH, type NextStepRequest } from "../shared/protocol";
import { askNextStep } from "./jev";

export type Env = { TYPESAFE_API_KEY?: string };

type Client = Pick<TypeSafeClient, "systemOne">;

const defaultClientFactory = (apiKey: string): Client =>
  // A game waits on this call, so keep retries short.
  new TypeSafeClient({ apiKey, timeout: 8_000, retry: { maxRetries: 1 } });

export function parseNextStepRequest(body: unknown): NextStepRequest | string {
  if (typeof body !== "object" || body === null) return "body must be an object";
  const { utterance, parsedSteps } = body as Record<string, unknown>;
  if (typeof utterance !== "string") return "utterance must be a string";
  if (utterance.length > MAX_UTTERANCE_LENGTH) return "utterance is too long";
  if (!Array.isArray(parsedSteps) || parsedSteps.length >= MAX_STEPS)
    return `parsedSteps must be an array shorter than ${MAX_STEPS}`;
  if (!parsedSteps.every(isStep)) return "parsedSteps contains an invalid step";
  return { utterance, parsedSteps };
}

export function createApp(makeClient: (apiKey: string) => Client = defaultClientFactory) {
  const app = new Hono<{ Bindings: Env }>();

  app.post("/api/next-step", async (c) => {
    const apiKey = c.env.TYPESAFE_API_KEY;
    if (!apiKey) return c.json({ error: "TYPESAFE_API_KEY is not configured" }, 500);

    const parsed = parseNextStepRequest(await c.req.json().catch(() => null));
    if (typeof parsed === "string") return c.json({ error: parsed }, 400);

    try {
      const answer = await askNextStep(
        makeClient(apiKey),
        parsed.utterance,
        parsed.parsedSteps,
        c.req.raw.signal,
      );
      return c.json(answer);
    } catch (err) {
      const status = err instanceof APIError ? err.status : undefined;
      console.error("TypeSafe request failed", { status, message: String(err) });
      return c.json({ error: "interpretation service failed" }, 502);
    }
  });

  app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

  return app;
}

export default createApp();
