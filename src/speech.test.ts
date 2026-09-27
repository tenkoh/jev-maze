import { describe, expect, it } from "vitest";
import { isIosNonSafari } from "./speech";

const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15";

describe("isIosNonSafari", () => {
  it.each([
    ["Chrome", `${IPHONE} (KHTML, like Gecko) CriOS/140.0.7339.101 Mobile/15E148 Safari/604.1`, 5],
    ["Firefox", `${IPHONE} (KHTML, like Gecko) FxiOS/143.0 Mobile/15E148 Safari/605.1.15`, 5],
    [
      "Edge",
      `${IPHONE} (KHTML, like Gecko) Version/18.0 EdgiOS/140.0.3485.94 Mobile/15E148 Safari/605.1.15`,
      5,
    ],
    ["in-app browser", `${IPHONE} (KHTML, like Gecko) Mobile/15E148 Line/15.14.0`, 5],
  ])("flags %s on iOS", (_name, ua, touch) => {
    expect(isIosNonSafari(ua, touch)).toBe(true);
  });

  it.each([
    ["iPhone Safari", `${IPHONE} (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1`, 5],
    [
      "iPad Safari (desktop UA)",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
      5,
    ],
    [
      "macOS Safari",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15",
      0,
    ],
    [
      "macOS Chrome",
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36",
      0,
    ],
    [
      "Android Chrome",
      "Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36",
      5,
    ],
  ])("allows %s", (_name, ua, touch) => {
    expect(isIosNonSafari(ua, touch)).toBe(false);
  });
});
