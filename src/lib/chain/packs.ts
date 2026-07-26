"use client";

import { parseEventLogs, type Address, type Hash } from "viem";

import {
  FACTORY_ADDRESS,
  PACKS_ADDRESS,
  QUOTER_ADDRESS,
  ROUTER_ADDRESS,
  erc20Abi,
  factoryAbi,
  packsAbi,
  poolAbi,
  quoterAbi,
  robinhood,
  routerAbi,
} from "@/lib/chain/config";
import { confirmTx, publicClient, useWallet } from "@/lib/chain/wallet";
import { COINS } from "@/lib/packs/pool";

/**
 * The on-chain pack: buy it, wait for the keeper to open it, sell what dropped.
 *
 * The shape the front end sees is deliberately the same one the browser roll
 * returns — a list of coins with amounts — so the sheet does not have to know
 * which of the two it is showing. What it does have to know is that the second
 * half of an on-chain open is **somebody else's transaction**: the buyer signs
 * the purchase, and the keeper reveals it a moment later. So `waitForReveal`
 * watches for events rather than awaiting a receipt, and it has to be able to
 * give up — a keeper that is down is a real state, and the answer to it is the
 * refund the contract already guarantees.
 */

export interface ChainPull {
  ticker: string;
  name: string;
  address: Address;
  rarity: string;
  /** Raw token units, as delivered. */
  amount: bigint;
  /** ETH spent on this line. */
  spentWei: bigint;
}

export interface BoughtPack {
  packId: bigint;
  hash: Hash;
  /** Block the purchase landed in — where the watch for the reveal starts. */
  fromBlock: bigint;
  paidWei: bigint;
}

const packs = () => {
  if (!PACKS_ADDRESS) throw new Error("Packs contract is not configured");
  return PACKS_ADDRESS;
};

const byAddress = new Map(
  COINS.map((coin) => [coin.address.toLowerCase(), coin]),
);

/** 32 bytes from the browser — the buyer's half of the draw. */
export const clientSeed = (): `0x${string}` => {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return `0x${[...bytes].map((b) => b.toString(16).padStart(2, "0")).join("")}`;
};

/** What the sheet needs before anyone commits: caps, fee, and whether it is open. */
export const readPackConfig = async () => {
  const address = packs();
  const [minStake, maxStake, feeBps, paused, seedsLeft] = await Promise.all([
    publicClient.readContract({
      address,
      abi: packsAbi,
      functionName: "minStake",
    }),
    publicClient.readContract({
      address,
      abi: packsAbi,
      functionName: "maxStake",
    }),
    publicClient.readContract({
      address,
      abi: packsAbi,
      functionName: "feeBps",
    }),
    publicClient.readContract({
      address,
      abi: packsAbi,
      functionName: "paused",
    }),
    publicClient.readContract({
      address,
      abi: packsAbi,
      functionName: "seedsLeft",
    }),
  ]);
  return { minStake, maxStake, feeBps: Number(feeBps), paused, seedsLeft };
};

export const buyPack = async (valueWei: bigint): Promise<BoughtPack> => {
  const wallet = useWallet.getState().walletClient();
  if (!wallet) throw new Error("Connect a wallet first");

  const hash = await wallet.writeContract({
    address: packs(),
    abi: packsAbi,
    functionName: "buy",
    args: [clientSeed()],
    value: valueWei,
    chain: robinhood,
    account: wallet.account!,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The purchase reverted");

  const [bought] = parseEventLogs({
    abi: packsAbi,
    eventName: "PackBought",
    logs: receipt.logs,
  });
  if (!bought) throw new Error("No pack in that transaction");

  return {
    packId: bought.args.packId,
    hash,
    fromBlock: receipt.blockNumber,
    paidWei: bought.args.paid,
  };
};

/**
 * Wait for the keeper to open a pack, and report what it delivered.
 *
 * Polls rather than subscribes: the public RPC is plain HTTP, and a poll that
 * misses a block still finds the event on the next pass because the search
 * always starts from the block the purchase landed in.
 */
export const waitForReveal = async (
  pack: BoughtPack,
  { timeoutMs = 120_000, everyMs = 700 } = {},
): Promise<ChainPull[]> => {
  const address = packs();
  const until = Date.now() + timeoutMs;

  // Scanned forward, not re-scanned.
  //
  // Reading from the purchase block on every pass meant the same blocks were
  // fetched again and again, and the work grew the longer the wait - which is
  // the opposite of what a wait needs. The cursor only moves forward; the logs
  // already seen are kept.
  let cursor = pack.fromBlock;
  const seen: Awaited<ReturnType<typeof publicClient.getLogs>> = [];

  for (;;) {
    const head = await publicClient.getBlockNumber();
    for (let from = cursor; from <= head; from += 400n) {
      const to = from + 399n < head ? from + 399n : head;
      seen.push(
        ...(await publicClient.getLogs({ address, fromBlock: from, toBlock: to })),
      );
      cursor = to + 1n;
    }

    const opened = parseEventLogs({
      abi: packsAbi,
      eventName: "PackOpened",
      logs: seen,
    }).find((event) => event.args.packId === pack.packId);

    if (opened) {
      const delivered = parseEventLogs({
        abi: packsAbi,
        eventName: "CoinDelivered",
        logs: seen,
      }).filter((event) => event.args.packId === pack.packId);

      // Repeats merge, the way the browser roll merges them.
      const rows = new Map<string, ChainPull>();
      for (const event of delivered) {
        const token = event.args.token.toLowerCase();
        const coin = byAddress.get(token);
        const row = rows.get(token) ?? {
          ticker: coin?.ticker ?? `${token.slice(0, 6)}…`,
          name: coin?.name ?? "Unknown coin",
          address: event.args.token,
          rarity: coin?.rarity ?? "COMMON",
          amount: 0n,
          spentWei: 0n,
        };
        row.amount += event.args.received;
        row.spentWei += event.args.spent;
        rows.set(token, row);
      }
      if (rows.size === 0) {
        // The pack settled and delivered nothing. That should be impossible -
        // `_deliver` swaps at least once - so it means the two halves disagree
        // about the event, not that the buyer got nothing. Say so plainly
        // rather than rendering a pack worth zero.
        throw new Error(
          "The pack settled but no coins were reported. Check the transaction on the explorer before buying another.",
        );
      }
      return [...rows.values()];
    }

    if (Date.now() > until) {
      throw new Error(
        "The pack has not been opened yet. It settles on its own, and after ten minutes you can refund it from your wallet.",
      );
    }
    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }
};

/** Take the ETH back for a pack nobody revealed. Only after the window. */
export const refundPack = async (packId: bigint): Promise<Hash> => {
  const wallet = useWallet.getState().walletClient();
  if (!wallet) throw new Error("Connect a wallet first");
  return wallet.writeContract({
    address: packs(),
    abi: packsAbi,
    functionName: "refund",
    args: [packId],
    chain: robinhood,
    account: wallet.account!,
  });
};

/** Balances of every coin a pack can drop, for the vault. */
export const readHoldings = async (owner: Address) => {
  const results = await Promise.all(
    COINS.map(async (coin) => {
      try {
        const [balance, decimals] = await Promise.all([
          publicClient.readContract({
            address: coin.address,
            abi: erc20Abi,
            functionName: "balanceOf",
            args: [owner],
          }),
          publicClient.readContract({
            address: coin.address,
            abi: erc20Abi,
            functionName: "decimals",
          }),
        ]);
        return { coin, balance, decimals: Number(decimals) };
      } catch {
        // A token that will not answer is not a reason to blank the page.
        return { coin, balance: 0n, decimals: 18 };
      }
    }),
  );
  return results.filter((row) => row.balance > 0n);
};

/**
 * Sell a coin back for ETH.
 *
 * Two transactions when the allowance is short, one when it is not — the
 * approval is asked for at the exact amount rather than unlimited, which costs
 * an extra signature the next time and leaves nothing standing if this site is
 * ever replaced by something that is not this site.
 */
export const sellBack = async (
  token: Address,
  poolFee: number,
  amount: bigint,
  minOut: bigint,
): Promise<Hash> => {
  const wallet = useWallet.getState().walletClient();
  const owner = useWallet.getState().address;
  if (!wallet || !owner) throw new Error("Connect a wallet first");

  const allowance = await publicClient.readContract({
    address: token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, packs()],
  });

  if (allowance < amount) {
    const approval = await wallet.writeContract({
      address: token,
      abi: erc20Abi,
      functionName: "approve",
      args: [packs(), amount],
      chain: robinhood,
      account: wallet.account!,
    });
    await confirmTx(approval, "The approval");
  }

  return wallet.writeContract({
    address: packs(),
    abi: packsAbi,
    functionName: "sellBack",
    args: [token, poolFee, amount, minOut],
    chain: robinhood,
    account: wallet.account!,
  });
};

/**
 * What a holding is worth in ETH right now, and the floor to sell it at.
 *
 * Quoted through Uniswap's quoter rather than guessed from a stored price: the
 * point of selling back is that it happens at market, and a minimum built from
 * a stale number is either a sale that reverts or one that fills anywhere.
 * Three per cent of room, the same tolerance the keeper gives a pack's swaps.
 */
export const quoteSell = async (
  token: Address,
  poolFee: number,
  amount: bigint,
): Promise<{ out: bigint; minOut: bigint }> => {
  const weth = await publicClient.readContract({
    address: ROUTER_ADDRESS,
    abi: routerAbi,
    functionName: "WETH9",
  });
  const { result } = await publicClient.simulateContract({
    address: QUOTER_ADDRESS,
    abi: quoterAbi,
    functionName: "quoteExactInputSingle",
    args: [
      {
        tokenIn: token,
        tokenOut: weth,
        amountIn: amount,
        fee: poolFee,
        sqrtPriceLimitX96: 0n,
      },
    ],
  });
  const out = result[0];
  return { out, minOut: (out * 9700n) / 10000n };
};

/** The pool fee tier each coin trades in, read from the contract's own list. */
export const readPoolFees = async (): Promise<Map<string, number>> => {
  const coins = await publicClient.readContract({
    address: packs(),
    abi: packsAbi,
    functionName: "allCoins",
  });
  return new Map(
    coins.map((coin) => [coin.token.toLowerCase(), Number(coin.poolFee)]),
  );
};

/**
 * What went wrong, in one sentence.
 *
 * viem's errors are written for a developer reading a stack trace: the whole
 * request, the calldata, the docs link. Printed into a sheet they are unusable
 * *and* they break its layout, because a hex blob is one unbreakable word.
 *
 * So the handful that a buyer can actually cause get a plain sentence, and
 * anything unrecognised falls back to viem's own short message rather than the
 * full dump. The detail is still in the console for whoever needs it.
 */
export const friendlyError = (error: unknown): string => {
  const raw =
    error instanceof Error
      ? `${(error as { shortMessage?: string }).shortMessage ?? ""} ${error.message}`
      : String(error);
  const text = raw.toLowerCase();

  if (text.includes("user rejected") || text.includes("user denied")) {
    return "You cancelled the transaction in your wallet.";
  }
  if (text.includes("insufficient funds")) {
    return "Not enough ETH in this wallet to cover the pack and gas.";
  }
  if (text.includes("no seeds queued")) {
    return "Packs are not open yet - no draws have been committed on-chain. Try again shortly.";
  }
  if (text.includes("paused")) {
    return "Sales are paused right now. Packs already bought still settle.";
  }
  if (text.includes("over max"))
    return "That stake is above the pack's ceiling.";
  if (text.includes("under min"))
    return "That stake is below the smallest pack.";
  if (text.includes("no coins configured")) {
    return "No coins are configured on the contract yet.";
  }
  if (text.includes("chain mismatch") || text.includes("does not match")) {
    return "Your wallet is on a different network. Switch to Robinhood Chain.";
  }

  const short = (error as { shortMessage?: string })?.shortMessage;
  if (typeof short === "string" && short.length > 0 && short.length < 160) {
    return short;
  }
  return "The transaction did not go through.";
};

export interface TokenLookup {
  address: Address;
  symbol: string;
  name: string;
  decimals: number;
  /** The v3 fee tier with the deepest pool against WETH, or null if there is none. */
  poolFee: number | null;
  liquidity: bigint;
}

/**
 * Look a token up before anyone puts it in a pack.
 *
 * Two questions, and the second is the one that matters: does it exist, and can
 * it be *bought*. A pack whose coin has no pool is a pack that reverts on the
 * swap, so the builder asks the factory for all three fee tiers and reports the
 * deepest — or nothing, which is an answer the form has to show rather than
 * swallow.
 */
export const lookupToken = async (token: Address): Promise<TokenLookup> => {
  const [symbol, name, decimals] = await Promise.all([
    publicClient
      .readContract({ address: token, abi: erc20Abi, functionName: "symbol" })
      .catch(() => "?"),
    publicClient
      .readContract({ address: token, abi: erc20Abi, functionName: "name" })
      .catch(() => "Unknown token"),
    publicClient
      .readContract({ address: token, abi: erc20Abi, functionName: "decimals" })
      .catch(() => 18),
  ]);

  const weth = await publicClient.readContract({
    address: ROUTER_ADDRESS,
    abi: routerAbi,
    functionName: "WETH9",
  });

  let best: { fee: number; liquidity: bigint } | null = null;
  for (const fee of [500, 3000, 10000]) {
    try {
      const pool = await publicClient.readContract({
        address: FACTORY_ADDRESS,
        abi: factoryAbi,
        functionName: "getPool",
        args: [weth, token, fee],
      });
      if (!pool || pool === "0x0000000000000000000000000000000000000000") continue;
      const liquidity = await publicClient.readContract({
        address: pool,
        abi: poolAbi,
        functionName: "liquidity",
      });
      if (liquidity > 0n && (!best || liquidity > best.liquidity)) {
        best = { fee, liquidity };
      }
    } catch {
      /* a tier that will not answer is a tier without a pool */
    }
  }

  return {
    address: token,
    symbol: String(symbol),
    name: String(name),
    decimals: Number(decimals),
    poolFee: best?.fee ?? null,
    liquidity: best?.liquidity ?? 0n,
  };
};

export interface TokenSaleState {
  enabled: boolean;
  token: Address;
  discountBps: number;
  budgetLeftWei: bigint;
}

/** Whether packs can be paid for in the project's token, and on what terms. */
export const readTokenSale = async (): Promise<TokenSaleState> => {
  const address = packs();
  const [enabled, token, discountBps, budgetLeftWei] = await Promise.all([
    publicClient.readContract({ address, abi: packsAbi, functionName: "tokenSales" }),
    publicClient.readContract({ address, abi: packsAbi, functionName: "payToken" }),
    publicClient.readContract({ address, abi: packsAbi, functionName: "tokenDiscountBps" }),
    publicClient.readContract({ address, abi: packsAbi, functionName: "tokenBudgetLeft" }),
  ]);
  return {
    enabled: Boolean(enabled),
    token: token as Address,
    discountBps: Number(discountBps),
    budgetLeftWei: budgetLeftWei as bigint,
  };
};

/** What a pack of this size costs in token, quoted by the contract itself. */
export const readTokenCost = (stakeWei: bigint): Promise<bigint> =>
  publicClient.readContract({
    address: packs(),
    abi: packsAbi,
    functionName: "tokenCost",
    args: [stakeWei],
  }) as Promise<bigint>;

/**
 * Buy a pack with the project's token.
 *
 * Two signatures when the allowance is short, one when it is not - and the
 * allowance is asked for at the exact cost rather than unlimited, so nothing is
 * left standing for a contract that might be replaced.
 */
export const buyPackWithToken = async (
  stakeWei: bigint,
): Promise<BoughtPack> => {
  const wallet = useWallet.getState().walletClient();
  const owner = useWallet.getState().address;
  if (!wallet || !owner) throw new Error("Connect a wallet first");

  const sale = await readTokenSale();
  if (!sale.enabled) throw new Error("Paying in $SHELLR is not switched on.");
  if (sale.budgetLeftWei < stakeWei) {
    throw new Error(
      "Today's allowance for token-paid packs is used up. Pay in ETH, or come back tomorrow.",
    );
  }

  const cost = await readTokenCost(stakeWei);
  const allowance = await publicClient.readContract({
    address: sale.token,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, packs()],
  });

  if (allowance < cost) {
    const approval = await wallet.writeContract({
      address: sale.token,
      abi: erc20Abi,
      functionName: "approve",
      args: [packs(), cost],
      chain: robinhood,
      account: wallet.account!,
    });
    await confirmTx(approval, "The approval");
  }

  const hash = await wallet.writeContract({
    address: packs(),
    abi: packsAbi,
    functionName: "buyWithToken",
    args: [clientSeed(), stakeWei],
    chain: robinhood,
    account: wallet.account!,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The purchase reverted");

  const [bought] = parseEventLogs({
    abi: packsAbi,
    eventName: "PackBought",
    logs: receipt.logs,
  });
  if (!bought) throw new Error("No pack in that transaction");

  return {
    packId: bought.args.packId,
    hash,
    fromBlock: receipt.blockNumber,
    paidWei: bought.args.paid,
  };
};

export interface CommunityPack {
  id: number;
  builder: Address;
  name: string;
  priceEth: number;
  coins: Address[];
  live: boolean;
  likes: number;
  dislikes: number;
  /** What the connected wallet voted: 0 none, 1 liked, 2 disliked. */
  myVote: number;
}

/** The most coins one community pack may name — enforced by the contract too. */
export const MAX_PACK_COINS = 10;

/**
 * Every pack anyone has registered.
 *
 * Read from the contract rather than from a server, which is the whole point of
 * putting them there: the shelf is the same for everyone, it outlives this
 * site, and nobody has to trust a database nobody can see.
 */
export const readCommunityPacks = async (
  voter?: Address,
): Promise<CommunityPack[]> => {
  const address = packs();
  const count = Number(
    await publicClient.readContract({
      address,
      abi: packsAbi,
      functionName: "communityPackCount",
    }),
  );

  const out: CommunityPack[] = [];
  for (let id = count - 1; id >= 0 && out.length < 60; id--) {
    const [pack, likes, dislikes, mine] = await Promise.all([
      publicClient.readContract({
        address,
        abi: packsAbi,
        functionName: "communityPack",
        args: [BigInt(id)],
      }) as Promise<[Address, bigint, string, Address[], boolean]>,
      publicClient.readContract({
        address,
        abi: packsAbi,
        functionName: "packLikes",
        args: [BigInt(id)],
      }),
      publicClient.readContract({
        address,
        abi: packsAbi,
        functionName: "packDislikes",
        args: [BigInt(id)],
      }),
      voter
        ? publicClient.readContract({
            address,
            abi: packsAbi,
            functionName: "packVote",
            args: [BigInt(id), voter],
          })
        : Promise.resolve(0),
    ]);
    const [builder, priceWei, name, coins, live] = pack;
    out.push({
      id,
      builder,
      name,
      priceEth: Number(priceWei) / 1e18,
      coins: [...coins],
      live,
      likes: Number(likes),
      dislikes: Number(dislikes),
      myVote: Number(mine),
    });
  }
  return out;
};

/** Put a pack on the shelf. One signature, no ETH. */
export const createCommunityPack = async (
  name: string,
  priceEth: number,
  coins: Address[],
): Promise<Hash> => {
  const wallet = useWallet.getState().walletClient();
  if (!wallet) throw new Error("Connect a wallet first");
  if (coins.length === 0) throw new Error("A pack needs at least one coin.");
  if (coins.length > MAX_PACK_COINS) {
    throw new Error(`A pack can hold at most ${MAX_PACK_COINS} coins.`);
  }

  const hash = await wallet.writeContract({
    address: packs(),
    abi: packsAbi,
    functionName: "createCommunityPack",
    args: [name, BigInt(Math.round(priceEth * 1e18)), coins],
    chain: robinhood,
    account: wallet.account!,
  });
  await confirmTx(hash, "The transaction");
  return hash;
};

/** Take a pack off the shelf. Its builder, or the owner. */
export const retireCommunityPack = async (id: number): Promise<Hash> => {
  const wallet = useWallet.getState().walletClient();
  if (!wallet) throw new Error("Connect a wallet first");
  const hash = await wallet.writeContract({
    address: packs(),
    abi: packsAbi,
    functionName: "retireCommunityPack",
    args: [BigInt(id)],
    chain: robinhood,
    account: wallet.account!,
  });
  await confirmTx(hash, "The transaction");
  return hash;
};

/** Like a pack, dislike it, or tap the same button again to take it back. */
export const votePack = async (id: number, up: boolean): Promise<Hash> => {
  const wallet = useWallet.getState().walletClient();
  if (!wallet) throw new Error("Connect a wallet first");
  const hash = await wallet.writeContract({
    address: packs(),
    abi: packsAbi,
    functionName: "votePack",
    args: [BigInt(id), up],
    chain: robinhood,
    account: wallet.account!,
  });
  await confirmTx(hash, "The transaction");
  return hash;
};
