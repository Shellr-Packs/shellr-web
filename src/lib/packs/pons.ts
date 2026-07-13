/**
 * The Pons Pack — one pack, priced by what you put in.
 *
 * The five tiers in `pool.ts` are fixed products: a set price, a set line-up,
 * a set number of draws. The Pons Pack is the other shape of the same
 * mechanic — **you name the stake** and the pack sizes itself to it. Every
 * meme it can reach launched on Pons, so there is one pool and no tier list.
 *
 * Two rules do all the work:
 *
 * 1. **Reach.** A coin is in the pack if one unit of it costs no more than
 *    `REACH ×` the stake. A small stake plays the cheap end of the launchpad;
 *    a large one puts PONS itself on the table. This is what stops a 0.01 ETH
 *    pack from being a lottery ticket on a 0.55 ETH coin, without needing a
 *    tier list to say so.
 * 2. **Size.** The pack draws as many coins as it takes to spend
 *    `TARGET_PAYOUT` of the stake at the *expected* value of one draw from
 *    what is in reach. So the count is derived, never hand-set, and it moves
 *    on its own when a coin's price moves.
 *
 * Neither of those makes the pack fair — the house edge is `1 - TARGET_PAYOUT`
 * before the fee, and a single pack lands anywhere either side of it. It is
 * the same bargain the tiers strike, written as arithmetic instead of a table.
 *
 * **This rolls in the browser**, exactly like `pool.ts`, and for the same
 * reason it is a placeholder: a draw a client can compute is a draw a client
 * can predict. The stake, the fee and the settle all have to move on-chain.
 */

import {
  COINS,
  bandOdds,
  drawOne,
  toPulls,
  type Coin,
  type Pull,
} from "@/lib/packs/pool";

/** Stakes offered as buttons, in ETH. Anything in range can be typed instead. */
export const PRESETS = [0.02, 0.05, 0.2] as const;

export const MIN_STAKE = 0.01;
/**
 * The fallback ceiling, used only until a contract answers.
 *
 * Once `NEXT_PUBLIC_PACKS_ADDRESS` is set the sheet reads `maxStake` off the
 * chain instead of this, because the contract is what decides whether a
 * purchase goes through - a sheet that accepts more than the contract will take
 * quotes a price and then reverts. To raise it for real:
 * `npm run limits -- 0.005 1.0` in `keeper/`.
 */
export const MAX_STAKE = 0.25;

/** Taken on top of the stake, not out of it — the line on the sheet. */
export const FEE_RATE = 0.02;

/** How far above the stake a single coin can be priced and still be drawable. */
const REACH = 3;

/** Share of the stake the pack is sized to return, before the roll's variance. */
const TARGET_PAYOUT = 0.8;

/** Draws are capped so a large stake cannot run the reveal off the screen. */
const MAX_DRAWS = 150;

export const clampStake = (stake: number): number =>
  Math.min(Math.max(stake, MIN_STAKE), MAX_STAKE);

/**
 * The coins this stake can pull, in the order the deck holds them.
 *
 * The sheet shows all ten and dims the rest, so the strip answers "what does
 * more money buy me" before the money is spent.
 */
export const inReach = (stake: number): Coin[] =>
  COINS.filter((coin) => coin.unit <= clampStake(stake) * REACH);

/** What one draw from a line-up is worth on average, in ETH. */
const drawValue = (from: Coin[]): number =>
  bandOdds(from).reduce((sum, [band, chance]) => {
    const inBand = from.filter((coin) => coin.rarity === band);
    const mean =
      inBand.reduce((total, coin) => total + coin.unit, 0) / inBand.length;
    return sum + chance * mean;
  }, 0);

/** How many coins a stake buys, before the roll wobbles it. */
export const packSize = (stake: number): number => {
  const from = inReach(stake);
  const value = drawValue(from);
  if (!value) return 1;
  const size = Math.round((clampStake(stake) * TARGET_PAYOUT) / value);
  return Math.min(Math.max(size, 1), MAX_DRAWS);
};

/** The fee, and what leaves the wallet. */
/**
 * What a stake costs — and the fee comes **out of it**, not on top.
 *
 * `ShellrPacks` takes its cut from the ETH it is sent and spends the rest, and
 * it compares the whole amount against the ceiling. Adding the fee on top made
 * the sheet ask for 0.051 for a 0.05 pack, which is over the ceiling: the
 * purchase reverted and the wallet reported it as a transaction likely to fail.
 *
 * So the number the buyer picks is the number that leaves their wallet.
 */
export const stakeCost = (stake: number): { fee: number; total: number } => {
  const total = clampStake(stake);
  return { fee: total * FEE_RATE, total };
};

/** Roll one Pons Pack. The count wobbles ±25% around the size the stake buys. */
export const openPonsPack = (stake: number): Pull[] => {
  const from = inReach(stake);
  const size = packSize(stake);
  const spread = Math.max(1, Math.round(size * 0.25));
  const count = Math.max(
    1,
    size - spread + Math.floor(Math.random() * (spread * 2 + 1)),
  );

  const units = new Map<string, number>();
  for (let drawn = 0; drawn < count; drawn += 1) {
    const coin = drawOne(from);
    if (!coin) break;
    units.set(coin.ticker, (units.get(coin.ticker) ?? 0) + 1);
  }
  return toPulls(units);
};

/**
 * The count the sheet prints — the exact bounds `openPonsPack` rolls between.
 *
 * Read off the same two numbers the roll uses rather than written down beside
 * it: a hand-typed range is a promise that goes stale the first time a coin is
 * repriced, and the number on the sheet is the one thing a buyer checks
 * against what drops.
 */
export const sizeRange = (stake: number): [number, number] => {
  const size = packSize(stake);
  const spread = Math.max(1, Math.round(size * 0.25));
  return [Math.max(1, size - spread), size + spread];
};
