import { describe, expect, it } from "vitest";
import { fixMisheardCounts } from "./normalize";

describe("fixMisheardCounts", () => {
  it.each([
    ["上にマス", "上2マス"],
    ["上ににマス", "上に2マス"],
    ["左へにマス", "左へ2マス"],
    ["下にます", "下2マス"],
    ["右行きます", "右1マス"],
    ["右に行きます", "右に1マス"],
    ["下へいきます", "下へ1マス"],
    ["上に市ます", "上に1マス"],
    ["左市マス", "左1マス"],
    ["上にマス右に行きます", "上2マス右に1マス"],
  ])("fixes %j", (input, expected) => {
    expect(fixMisheardCounts(input)).toBe(expected);
  });

  it.each([
    "上に2マス",
    "右に1マス、下に3マス",
    "まっすぐ行きます",
    "右に行って下に突き当たりまで",
    "右に曲がって行きます",
    "",
  ])("leaves %j unchanged", (input) => {
    expect(fixMisheardCounts(input)).toBe(input);
  });
});
