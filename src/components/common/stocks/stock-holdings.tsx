"use client";

import { formatUnits, type Address } from "viem";
import { useEffect, useState } from "react";

import { publicClient, useWallet } from "@/lib/chain/wallet";
import { readStockConfig, stocksLive } from "@/lib/chain/stock-packs";
import {
  TICKER_META,
  TickerMark,
  symbolOf,
} from "@/components/common/stocks/stock-pack";

/**
 * Tokenized shares, in the inventory.
 *
 * Its own section rather than mixed into the coin grid, because the two are
 * not the same kind of thing: a meme pull is a card with art and a rarity, a
 * share is a position in a company. Sorting them together would put NVDA
 * between two jpegs and make both look like the wrong thing.
 *
 * **Read from the chain, not from the vault.** The meme side keeps a local
 * store because the browser roll is a demonstration; these are real ERC-20
 * balances, and the wallet is the only honest source. That also means a share
 * sold anywhere else disappears from here, which is correct - a page that kept
 * showing shares the wallet no longer holds would be lying comfortably.
 */

const erc20 = [
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
] as const;

interface Holding {
  token: Address;
  symbol: string;
  amount: string;
}

export const StockHoldings = () => {
  const address = useWallet((state) => state.address);
  const [holdings, setHoldings] = useState<Holding[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!stocksLive || !address) {
      setHoldings(null);
      return;
    }
    let live = true;

    (async () => {
      try {
        const config = await readStockConfig();
        const balances = await Promise.all(
          config.stocks.map(async (entry) => {
            const raw = await publicClient.readContract({
              address: entry.token,
              abi: erc20,
              functionName: "balanceOf",
              args: [address],
            });
            return {
              token: entry.token,
              symbol: symbolOf(entry.token),
              amount: formatUnits(raw, 18),
            };
          }),
        );
        if (!live) return;
        setHoldings(balances.filter((h) => Number(h.amount) > 0));
        setFailed(false);
      } catch {
        if (live) setFailed(true);
      }
    })();

    return () => {
      live = false;
    };
  }, [address]);

  if (!stocksLive) return null;

  return (
    <section className="mt-16">
      <div className="flex items-baseline justify-between">
        <h2 className="text-[0.75rem] font-semibold tracking-[0.12em] text-nav-text/45 uppercase">
          Shares
        </h2>
        <span className="text-[0.75rem] text-nav-text/30">
          Balances read from the chain
        </span>
      </div>

      {!address ? (
        <p className="mt-4 text-[0.875rem] text-nav-text/40">
          Connect a wallet to see what you are holding.
        </p>
      ) : failed ? (
        <p className="mt-4 text-[0.875rem] text-nav-text/40">
          Could not read balances just now — the RPC did not answer.
        </p>
      ) : holdings === null ? (
        <p className="mt-4 text-[0.875rem] text-nav-text/40">Reading…</p>
      ) : holdings.length === 0 ? (
        <p className="mt-4 text-[0.875rem] text-nav-text/40">
          No shares yet. A stock pack drops one company from the lineup.
        </p>
      ) : (
        <ul className="mt-4 grid gap-px overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] sm:grid-cols-2 lg:grid-cols-3">
          {holdings.map((holding) => (
            <li
              key={holding.token}
              className="flex items-center gap-4 bg-nav-panel px-5 py-5"
            >
              <TickerMark symbol={holding.symbol} size={40} />
              <div className="min-w-0">
                <p className="font-display text-[1.5rem] leading-none font-semibold">
                  {Number(holding.amount).toFixed(4)}
                </p>
                <p className="mt-1 truncate text-[0.8125rem] text-nav-text/50">
                  {holding.symbol} ·{" "}
                  {TICKER_META[holding.symbol]?.name ?? "share"}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
};
