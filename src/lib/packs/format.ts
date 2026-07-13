import { COINS } from "@/lib/packs/pool";

/**
 * What the two reveal sheets print, in one place.
 *
 * The Pons Pack and the tier theatre show the same three things about a pull —
 * the coin's mark, how much of it arrived, and where the pack landed against
 * what it cost — and they were drifting apart line by line. A pack that reports
 * differently depending on which door it was opened from is a pack nobody
 * trusts twice.
 */

/** The coin's own round logo, by ticker. */
export const AVATAR = new Map(COINS.map((coin) => [coin.ticker, coin.avatar]));

/** Tokens per ETH, by ticker — see `Coin.perEth`. */
const RATE = new Map(COINS.map((coin) => [coin.ticker, coin.perEth]));

/**
 * How many coins a line is actually worth, written the way an amount is.
 *
 * The reveal used to print the number of *draws* — a x3 that meant "the roll
 * landed here three times", which is bookkeeping, not what arrived in a wallet.
 */
export const coinAmount = (ticker: string, valueEth: number): string => {
  const coins = valueEth * (RATE.get(ticker) ?? 0);
  return coins.toLocaleString("en-US", {
    maximumFractionDigits: coins < 100 ? 2 : 0,
  });
};

/** Where the pack landed against what it cost. */
export const pnl = (value: number, paid: number): string => {
  const change = ((value - paid) / paid) * 100;
  return `${change >= 0 ? "+" : ""}${change.toFixed(2)}%`;
};

export const UP = "#31d67a";
export const DOWN = "#ff3a6e";
