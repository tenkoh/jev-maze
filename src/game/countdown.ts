/**
 * When to start speech recognition, in ms from the start of the countdown.
 * Starting a little before "recording" warms the recognizer up so the first
 * words are not clipped, while most countdown noise is still ignored.
 */
export function listenStartOffset(countdownMs: number, leadMs: number): number {
  const lead = Number.isFinite(leadMs) ? Math.min(Math.max(leadMs, 0), countdownMs) : 0;
  return countdownMs - lead;
}
