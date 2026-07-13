/**
 * The coin pool and the table a pack is rolled against.
 *
 * One source of truth for three places that would otherwise drift: the deck on
 * the home page, the odds printed in `/docs`, and the roll itself. Change a
 * coin's band here and all three move together.
 *
 * **This rolls in the browser.** Nothing here touches a chain, signs anything,
 * or moves value — it is the shape of the mechanic, running locally, so the
 * flow can be walked end to end before the contracts exist. A real roll has to
 * be settled on-chain: a draw a client can compute is a draw a client can
 * predict, and predicting it is the whole exploit.
 */

export type Rarity = "MYTHIC" | "LEGENDARY" | "EPIC" | "RARE" | "COMMON";

export interface Coin {
  ticker: string;
  name: string;
  /**
   * The ERC-20 on Robinhood Chain.
   *
   * What the contract actually swaps into, and what the vault reads a balance
   * from once the site is wired. Verify any change of these on the explorer —
   * a wrong address here is a pack that buys something else.
   */
  address: `0x${string}`;
  rarity: Rarity;
  /** Card art — the same faces the deck on the home page turns. */
  art: string;
  /**
   * Tokens one ETH buys, for turning a pack's ETH into a real coin count.
   *
   * **A snapshot, not a feed.** These came off the quoter on Robinhood Chain
   * (`npm run pools` in `keeper/`, quoting 0.005 ETH per coin) and they drift
   * from the moment they were read. Once the site is wired to the contract the
   * amount comes back from the swap itself and this field goes; until then it
   * is what stops the reveal from printing a draw count where a buyer expects
   * an amount of coins.
   */
  perEth: number;
  /** A circular crop of the meme itself, for the line-up on the pack sheet. */
  avatar: string;
  /** What one unit is worth, in ETH. Priced off the coin's all-time high. */
  unit: number;
}

export const COINS: Coin[] = [
  {
    ticker: "PONS",
    name: "Pons",
    address: "0x39dbed3a2bd333467115de45665cc57f813c4571",
    rarity: "MYTHIC",
    art: "/assets/team/tok1-v85.webp",
    unit: 0.55,
    perEth: 7295,
    avatar: "/assets/coins/pons.png",
  },
  {
    ticker: "CASHCAT",
    name: "Cashcat",
    address: "0x020bfc650a365f8bb26819deaabf3e21291018b4",
    rarity: "MYTHIC",
    art: "/assets/team/tok2-v85.webp",
    unit: 0.34,
    perEth: 11589,
    avatar: "/assets/coins/cashcat.png",
  },
  {
    ticker: "AI",
    name: "Artificial Inu",
    address: "0x2e8c31162b855a2ffa90f6f8634643ad6f111e18",
    rarity: "LEGENDARY",
    art: "/assets/team/tok3-v85.webp",
    unit: 0.095,
    perEth: 24404,
    avatar: "/assets/coins/ai.png",
  },
  {
    ticker: "NET",
    name: "NetNet",
    address: "0xca9c78dd337a67f6e0077f65f5e9218719d30edf",
    rarity: "LEGENDARY",
    art: "/assets/team/tok4-v85.webp",
    unit: 0.09,
    perEth: 25000,
    avatar: "/assets/coins/net.png",
  },
  {
    ticker: "HMM",
    name: "Thinking Cat",
    address: "0x7fe995a80075df3dc8ae11a9b82c7fe4202cd87f",
    rarity: "EPIC",
    art: "/assets/team/tok5-v85.webp",
    unit: 0.028,
    perEth: 96348,
    avatar: "/assets/coins/hmm.png",
  },
  {
    ticker: "TENDIES",
    name: "Tendies",
    address: "0x45242320dbb855eea8fd36804c6487e10e97fcf9",
    rarity: "EPIC",
    art: "/assets/team/tok6-v85.webp",
    unit: 0.026,
    perEth: 134483,
    avatar: "/assets/coins/tendies.png",
  },
  {
    ticker: "MICRODUCK",
    name: "microduck",
    address: "0xd5f1afea47b1a9eab414d2ee740cf1d6d039e725",
    rarity: "RARE",
    art: "/assets/team/tok7-v85.webp",
    unit: 0.007,
    perEth: 127761,
    avatar: "/assets/coins/microduck.png",
  },
  {
    ticker: "DELTA",
    name: "Delta",
    address: "0xe8ffd7e24187f72afb08d75b1bb13088a989a791",
    rarity: "RARE",
    art: "/assets/team/tok8-v85.webp",
    unit: 0.0062,
    perEth: 92619,
    avatar: "/assets/coins/delta.png",
  },
  {
    ticker: "JUGGERNAUT",
    name: "The Juggernaut",
    address: "0xd7321801caae694090694ff55a9323139f043b88",
    rarity: "COMMON",
    art: "/assets/team/tok9-v85.webp",
    unit: 0.0022,
    perEth: 367149,
    avatar: "/assets/coins/juggernaut.png",
  },
  {
    ticker: "HOOKR",
    name: "Hookr.fun",
    address: "0x18e674231a58c239dc7daedcffe15ec3a24cff5c",
    rarity: "COMMON",
    art: "/assets/team/tok10-v85.webp",
    unit: 0.0018,
    perEth: 150157,
    avatar: "/assets/coins/hookr.png",
  },
];

/** Chance of each band, per draw. Sums to 1. Printed in `/docs`. */
export const ODDS: Record<Rarity, number> = {
  MYTHIC: 0.004,
  LEGENDARY: 0.02,
  EPIC: 0.065,
  RARE: 0.15,
  COMMON: 0.761,
};

export interface Tier {
  /**
   * The photographed foil pack for this tier.
   *
   * The **price is printed on the artwork**, so `priceEth` cannot move without
   * new art — the sheet would say one thing and the pack in the same sheet
   * another. `draws` is free: the current art deliberately leaves the coin
   * count off, so the range lives in one place, here.
   */
  art: string;
  /**
   * The tear, filmed. Optional — a tier without one gets the plain wait.
   *
   * The clip runs while the pack is opening and the reveal takes over at the
   * moment the wrapper leaves frame, so the card the film ends on and the card
   * the sheet shows are the same beat.
   */
  video?: string;
  /**
   * Seconds into `video` at which the wrapper has left frame.
   *
   * Read off each clip frame by frame — they are not choreographed alike: the
   * dearest two tear a good three quarters of a second earlier than the
   * cheapest. A shared constant cut two of them mid-tear.
   */
  revealAt?: number;
  /** Matches the name in `data/mocks/home.ts` → `cases.items`, which is what
      the carousel hands over when a set is picked. */
  name: string;
  priceEth: number;
  /**
   * How many memcoins drop — the range printed on the pack itself.
   *
   * One draw is **one coin**, not one line: a coin can be drawn more than once
   * and the reveal merges the repeats into a single row with a higher count.
   * That is what lets a tier promise twenty coins out of a pool of eight.
   */
  draws: [number, number];
  /** A band the pack is guaranteed to hit at least once, if any. */
  floor?: Rarity;
  /**
   * The coins this tier can draw, by ticker.
   *
   * Every tier used to roll the whole pool, which made the five of them the
   * same pack at five prices — the only thing that changed was how many times
   * it rolled. A line-up per tier is what makes the choice mean something: the
   * cheap pack cannot reach the top coins at all, and the top two appear in one
   * pack only.
   *
   * Must hold at least `draws[1]` tickers, since no coin is drawn twice.
   */
  pool: string[];
}

export const TIERS: Tier[] = [
  {
    name: "Basic Pack",
    art: "/assets/packs-art/basic-pack-v84.webp",
    video: "/assets/packs-open/basic-open-v64.mp4",
    revealAt: 4.2,
    priceEth: 0.01,
    draws: [1, 5],
    pool: ["HOOKR", "JUGGERNAUT", "DELTA"],
  },
  {
    name: "Common Pack",
    art: "/assets/packs-art/common-pack-v84.webp",
    video: "/assets/packs-open/common-open-v71.mp4",
    revealAt: 4.5,
    priceEth: 0.02,
    draws: [2, 7],
    pool: ["HOOKR", "JUGGERNAUT", "DELTA", "MICRODUCK"],
  },
  {
    name: "Rare Pack",
    art: "/assets/packs-art/rare-pack-v84.webp",
    video: "/assets/packs-open/rare-open-v71.mp4",
    revealAt: 4.25,
    priceEth: 0.05,
    draws: [3, 10],
    floor: "RARE",
    pool: ["HOOKR", "JUGGERNAUT", "DELTA", "MICRODUCK", "TENDIES", "HMM"],
  },
  {
    name: "Starter Pack",
    art: "/assets/packs-art/starter-pack-v84.webp",
    video: "/assets/packs-open/starter-open-v71.mp4",
    revealAt: 3.8,
    priceEth: 0.1,
    draws: [5, 15],
    floor: "EPIC",
    pool: ["JUGGERNAUT", "DELTA", "MICRODUCK", "TENDIES", "HMM", "NET", "AI"],
  },
  {
    name: "Premium Pack",
    art: "/assets/packs-art/premium-pack-v84.webp",
    video: "/assets/packs-open/premium-open-v71.mp4",
    revealAt: 3.8,
    priceEth: 0.5,
    draws: [10, 20],
    floor: "LEGENDARY",
    // The only pack that can reach PONS or CASHCAT.
    pool: [
      "DELTA",
      "MICRODUCK",
      "TENDIES",
      "HMM",
      "NET",
      "AI",
      "CASHCAT",
      "PONS",
    ],
  },
];

/** The coins a tier can draw, in the order the deck holds them. */
export const tierCoins = (tier: Tier): Coin[] =>
  COINS.filter((coin) => tier.pool.includes(coin.ticker));

export const tierByName = (name: string): Tier =>
  TIERS.find((tier) => tier.name === name) ?? TIERS[0];

export interface Pull {
  ticker: string;
  name: string;
  rarity: Rarity;
  art: string;
  units: number;
  /** Units × the coin's unit price, in ETH. */
  valueEth: number;
}

const between = (lo: number, hi: number): number =>
  lo + Math.floor(Math.random() * (hi - lo + 1));

/**
 * The published odds, **renormalised over the bands this tier actually holds**.
 *
 * The table is written for the whole pool, and a tier that carries no Commons
 * would otherwise have three quarters of its probability fall through onto
 * whatever its lowest band happens to be. That made the dearest pack pay out
 * mostly Rares: it held PONS, and almost never reached it.
 *
 * Renormalising keeps the *shape* of the table — a Mythic stays a fiftieth as
 * likely as a Legendary — while spending the missing bands' weight across the
 * ones that are there.
 */
export const bandOdds = (from: Coin[]): Array<[Rarity, number]> => {
  const present = (Object.keys(ODDS) as Rarity[]).filter((band) =>
    from.some((coin) => coin.rarity === band),
  );
  const total = present.reduce((sum, band) => sum + ODDS[band], 0);
  return present.map((band) => [band, ODDS[band] / total]);
};

/** One coin, band rolled against this tier's own line-up. */
export const drawOne = (from: Coin[], forceBand?: Rarity): Coin | null => {
  if (!from.length) return null;
  let band = forceBand;
  if (!band) {
    let roll = Math.random();
    const table = bandOdds(from);
    band = table[table.length - 1][0];
    for (const [candidate, chance] of table) {
      roll -= chance;
      if (roll <= 0) {
        band = candidate;
        break;
      }
    }
  }
  const open = from.filter((coin) => coin.rarity === band);
  const pick = open.length ? open : from;
  return pick[Math.floor(Math.random() * pick.length)];
};

/**
 * Roll one pack.
 *
 * Draws as many coins as the tier prints on its front, one at a time. Repeats
 * are allowed and merge into a single row: a tier promising twenty coins out of
 * a pool of eight has to repeat, and twenty separate rows would be unreadable
 * anyway.
 *
 * The floor is drawn first, so the guarantee holds whatever the rest of the
 * rolls do.
 */
export const openPack = (tier: Tier): Pull[] => {
  const from = tierCoins(tier);
  const count = between(tier.draws[0], tier.draws[1]);
  const units = new Map<string, number>();

  const take = (coin: Coin | null): void => {
    if (!coin) return;
    units.set(coin.ticker, (units.get(coin.ticker) ?? 0) + 1);
  };

  if (tier.floor) take(drawOne(from, tier.floor));
  while ([...units.values()].reduce((a, b) => a + b, 0) < count) {
    take(drawOne(from));
    if (!from.length) break;
  }

  return toPulls(units);
};

/**
 * Turn a tally of draws into the rows the reveal shows — rarest first.
 *
 * Shared with the Pons Pack (`lib/packs/pons.ts`), which counts its draws the
 * same way and differs only in how many it takes and from what.
 */
export const toPulls = (units: Map<string, number>): Pull[] => {
  const order: Rarity[] = ["MYTHIC", "LEGENDARY", "EPIC", "RARE", "COMMON"];
  return [...units.entries()]
    .map(([ticker, held]) => {
      const coin = COINS.find((c) => c.ticker === ticker)!;
      return {
        ticker,
        name: coin.name,
        rarity: coin.rarity,
        art: coin.art,
        units: held,
        valueEth: held * coin.unit,
      };
    })
    .sort((a, b) => order.indexOf(a.rarity) - order.indexOf(b.rarity));
};

export const totalEth = (pulls: Pull[]): number =>
  pulls.reduce((sum, pull) => sum + pull.valueEth, 0);

/** ETH, at the precision the interface shows it. */
export const eth = (value: number): string =>
  `${value.toFixed(4).replace(/0+$/, "").replace(/\.$/, "")} ETH`;
