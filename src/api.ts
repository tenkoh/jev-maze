import type { NextStepResponse, Step } from "../shared/protocol";

export async function fetchNextStep(
  utterance: string,
  parsedSteps: Step[],
  signal?: AbortSignal,
): Promise<NextStepResponse> {
  const res = await fetch("/api/next-step", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ utterance, parsedSteps }),
    ...(signal ? { signal } : {}),
  });
  if (!res.ok) throw new Error(`next-step failed: ${res.status}`);
  return (await res.json()) as NextStepResponse;
}
