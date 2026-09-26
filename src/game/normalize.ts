/** A direction kanji, optionally followed by the particle に / へ. */
const AFTER_DIRECTION = "(?<=[上下左右][にへ]?)";

/**
 * Where a spoken した can only be the direction 下: at the start, after punctuation, or
 * right after the end of a movement (a direction, まっすぐ, a distance, 〜て). A past-tense
 * した follows a verb stem instead (右折した, 移動した), and is left alone.
 */
const SHITA_AS_DOWN = /(?<=^|[、。,，\s0-9０-９上下左右]|まっすぐ|そのまま|マス|まで|[てで])した/g;

/**
 * Fix words that speech recognition commonly mishears, before Jev reads them.
 * Only text in a movement position is rewritten, so the same words elsewhere are kept.
 * - 右まっすぐした -> 右まっすぐ下: 下 often comes out as した (see SHITA_AS_DOWN).
 * - 上にマス / 上ににマス -> 上2マス / 上に2マス: a に right before マス is the number 2.
 * - 上行きます / 上に行きます / 上に市ます -> 上1マス / 上に1マス / 上に1マス: 1マス (いちマス)
 *   often comes out as 行きます or 市ます. A real 行きます is rare in a 3-second command
 *   (players say 行って), so the occasional misread "until the wall" is worth it.
 */
export const fixMisheard = (utterance: string): string =>
  utterance
    // First, so that a fixed 下 is seen by the distance fixes below (したにマス -> 下2マス).
    .replace(SHITA_AS_DOWN, "下")
    .replace(new RegExp(`${AFTER_DIRECTION}に(?:マス|ます)`, "g"), "2マス")
    .replace(new RegExp(`${AFTER_DIRECTION}(?:行きます|いきます|市ます|市マス)`, "g"), "1マス");
