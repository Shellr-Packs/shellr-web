"use client";

import { formatUnits, parseEventLogs, type Address, type Hash } from "viem";

import { robinhood } from "@/lib/chain/config";
import { publicClient, useWallet } from "@/lib/chain/wallet";
import { clientSeed, friendlyError } from "@/lib/chain/packs";

/**
 * `ShellrStockPacks`, from the browser.
 *
 * Separate from `packs.ts` rather than folded into it, because the two
 * contracts only look alike. A meme pack spreads its stake over slices and
 * comes back with a handful of coins; a stock pack makes one swap and comes
 * back with one share. Sharing a module would have meant a union type
 * everywhere and two code paths inside every function.
 *
 * **No hardcoded fallback address.** `config.ts` hardcodes the meme packs
 * because that contract is deployed, public and tested. This one is neither
 * tested nor deployed, so it stays behind an environment variable: a build that
 * silently found an address for an untested contract holding real ETH is the
 * failure mode worth designing against here.
 */

const configured = process.env.NEXT_PUBLIC_STOCK_PACKS_ADDRESS ?? "";

export const STOCK_PACKS_ADDRESS: Address | null = /^0x[0-9a-fA-F]{40}$/.test(
  configured,
)
  ? (configured as Address)
  : null;

export const stocksLive = STOCK_PACKS_ADDRESS !== null;

const contract = (): Address => {
  if (!STOCK_PACKS_ADDRESS) throw new Error("Stock packs are not live yet");
  return STOCK_PACKS_ADDRESS;
};

export const stockPacksAbi = [
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [{ name: "clientSeed", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "sellBack",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "amount", type: "uint256" },
      { name: "minOut", type: "uint256" },
      { name: "deadline", type: "uint256" },
      {
        name: "hops",
        type: "tuple[]",
        components: [
          { name: "kind", type: "uint8" },
          { name: "pool", type: "address" },
          { name: "zeroForOne", type: "bool" },
          { name: "feePpm", type: "uint24" },
        ],
      },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "packId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "stocks",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "token", type: "address" },
      { name: "live", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "stockCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "minStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "maxStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "feeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "seedsLeft",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "bankroll",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "event",
    name: "PackBought",
    inputs: [
      { name: "packId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "stake", type: "uint256", indexed: false },
      { name: "seedIndex", type: "uint64", indexed: false },
      { name: "clientSeed", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PackOpened",
    inputs: [
      { name: "packId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "secret", type: "bytes32", indexed: false },
      { name: "stake", type: "uint256", indexed: false },
      { name: "mult", type: "uint16", indexed: false },
      { name: "spend", type: "uint256", indexed: false },
      { name: "received", type: "uint256", indexed: false },
    ],
  },
] as const;

export interface StockConfig {
  minWei: bigint;
  maxWei: bigint;
  feeBps: number;
  paused: boolean;
  seedsLeft: bigint;
  bankrollWei: bigint;
  stocks: { index: number; token: Address; live: boolean }[];
}

/** Everything the sheet needs before anyone commits. */
export const readStockConfig = async (): Promise<StockConfig> => {
  const address = contract();
  const base = { address, abi: stockPacksAbi } as const;

  const [minWei, maxWei, fee, paused, seedsLeft, bankrollWei, count] =
    await Promise.all([
      publicClient.readContract({ ...base, functionName: "minStake" }),
      publicClient.readContract({ ...base, functionName: "maxStake" }),
      publicClient.readContract({ ...base, functionName: "feeBps" }),
      publicClient.readContract({ ...base, functionName: "paused" }),
      publicClient.readContract({ ...base, functionName: "seedsLeft" }),
      publicClient.readContract({ ...base, functionName: "bankroll" }),
      publicClient.readContract({ ...base, functionName: "stockCount" }),
    ]);

  const stocks = await Promise.all(
    Array.from({ length: Number(count) }, (_, index) =>
      publicClient
        .readContract({
          ...base,
          functionName: "stocks",
          args: [BigInt(index)],
        })
        .then(([token, live]) => ({ index, token, live })),
    ),
  );

  return {
    minWei,
    maxWei,
    feeBps: Number(fee),
    paused,
    seedsLeft,
    bankrollWei,
    stocks,
  };
};

export interface BoughtStockPack {
  packId: bigint;
  hash: Hash;
  fromBlock: bigint;
  stakeWei: bigint;
}

export const buyStockPack = async (
  valueWei: bigint,
): Promise<BoughtStockPack> => {
  const wallet = useWallet.getState().walletClient();
  if (!wallet) throw new Error("Connect a wallet first");

  const hash = await wallet.writeContract({
    address: contract(),
    abi: stockPacksAbi,
    functionName: "buy",
    args: [clientSeed()],
    value: valueWei,
    chain: robinhood,
    account: wallet.account!,
  });

  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") throw new Error("The purchase reverted");

  const [bought] = parseEventLogs({
    abi: stockPacksAbi,
    eventName: "PackBought",
    logs: receipt.logs,
  });
  if (!bought) throw new Error("No pack in that transaction");

  return {
    packId: bought.args.packId,
    hash,
    fromBlock: receipt.blockNumber,
    stakeWei: bought.args.stake,
  };
};

export interface StockPull {
  token: Address;
  /** Shares delivered, already scaled out of wei. */
  amount: string;
  /** Payout multiplier in basis points. 14000 is 1.40x. */
  mult: number;
  spendWei: bigint;
  stakeWei: bigint;
}

/**
 * Wait for the keeper to open the pack.
 *
 * Polls from the purchase block rather than subscribing, for the same reason
 * the meme sheet does: the public RPC is plain HTTP, and a poll that misses a
 * block still finds the event next pass because the search always restarts
 * from where the buy landed.
 *
 * The window is generous because the keeper is allowed up to three attempts at
 * widening tolerances before it gives up, and each is a round trip to a quote
 * and back to the chain.
 */
export const waitForStockReveal = async (
  pack: BoughtStockPack,
  { timeoutMs = 180_000, everyMs = 900 } = {},
): Promise<StockPull> => {
  const address = contract();
  const until = Date.now() + timeoutMs;

  while (Date.now() < until) {
    // Fetch the contract's logs for the window and match on `packId` here
    // rather than as an indexed filter: typing the filter against a `const`
    // ABI fights viem for no gain, and the window is a handful of blocks.
    const logs = await publicClient.getLogs({
      address,
      fromBlock: pack.fromBlock,
      toBlock: "latest",
    });

    const opened = parseEventLogs({
      abi: stockPacksAbi,
      eventName: "PackOpened",
      logs,
    }).find((entry) => entry.args.packId === pack.packId);

    if (opened) {
      return {
        token: opened.args.token,
        amount: formatUnits(opened.args.received, 18),
        mult: Number(opened.args.mult),
        spendWei: opened.args.spend,
        stakeWei: opened.args.stake,
      };
    }

    await new Promise((resolve) => setTimeout(resolve, everyMs));
  }

  throw new Error(
    "The keeper did not open this pack in time. You can refund it from the contract after the reveal window.",
  );
};

export const refundStockPack = async (packId: bigint): Promise<Hash> => {
  const wallet = useWallet.getState().walletClient();
  if (!wallet) throw new Error("Connect a wallet first");

  return wallet.writeContract({
    address: contract(),
    abi: stockPacksAbi,
    functionName: "refund",
    args: [packId],
    chain: robinhood,
    account: wallet.account!,
  });
};

export { friendlyError };
