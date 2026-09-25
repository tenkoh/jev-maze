/** A direction kanji, optionally followed by the particle に / へ. */
const AFTER_DIRECTION = "(?<=[上下左右][にへ]?)";

/**
 * Fix distances that speech recognition commonly mishears, before Jev reads them.
 * Only text right after a direction is rewritten, so the same words elsewhere are kept.
 * - 上にマス / 上ににマス -> 上2マス / 上に2マス: a に right before マス is the number 2.
 * - 上行きます / 上に行きます / 上に市ます -> 上1マス / 上に1マス / 上に1マス: 1マス (いちマス)
 *   often comes out as 行きます or 市ます. A real 行きます is rare in a 3-second command
 *   (players say 行って), so the occasional misread "until the wall" is worth it.
 */
export const fixMisheardCounts = (utterance: string): string =>
  utterance
    .replace(new RegExp(`${AFTER_DIRECTION}に(?:マス|ます)`, "g"), "2マス")
    .replace(new RegExp(`${AFTER_DIRECTION}(?:行きます|いきます|市ます|市マス)`, "g"), "1マス");
