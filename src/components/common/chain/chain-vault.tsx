"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { formatEther, formatUnits } from "viem";

import { WalletButton } from "@/components/common/chain/wallet-button";
import { explorerTx } from "@/lib/chain/config";
import {
  friendlyError,
  quoteSell,
  readHoldings,
  readPoolFees,
  sellBack,
} from "@/lib/chain/packs";
import { onRightChain, publicClient, useWallet } from "@/lib/chain/wallet";
import { AVATAR, UP } from "@/lib/packs/format";
import type { Coin } from "@/lib/packs/pool";
import { SELL_FEE } from "@/lib/packs/vault";

/**
 * The vault, read from the chain.
 *
 * There is nothing to store: the coins are ERC-20s in the visitor's own wallet,
 * so this page is a view over balances rather than a ledger of its own. That is
 * the whole point of delivering straight from the swap — close the tab, come
 * back on another machine, the holdings are still there because they were never
 * here.
 *
 * Prices are quoted live, one call per coin. A stored price would be a number
 * that is wrong by the time it is read, and this page's only job is to say what
 * a holding is worth *now* and let it be sold.
 */

const BAND: Record<string, string> = {
  MYTHIC: "#ff3a6e",
  LEGENDARY: "#f5c420",
  EPIC: "#a6e62c",
  RARE: "#b0bec5",
  COMMON: "#78848c",
};

interface Row {
  coin: Coin;
  balance: bigint;
  decimals: number;
  poolFee?: number;
  /** ETH the swap would return right now, before the fee. */
  quoteWei?: bigint;
}

const amount = (balance: bigint, decimals: number): string =>
  Number(formatUnits(balance, decimals)).toLocaleString("en-US", {
    maximumFractionDigits: 2,
  });

export const ChainVault = () => {
  const address = useWallet((state) => state.address);
  const chainId = useWallet((state) => state.chainId);
  const ready = !!address && onRightChain(chainId);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sold, setSold] = useState<{ wei: bigint; hash: string } | null>(null);

  const load = useCallback(async () => {
    if (!address) return;
    setError(null);
    try {
      const [held, fees] = await Promise.all([
        readHoldings(address),
        readPoolFees(),
      ]);
      const priced = await Promise.all(
        held.map(async (row) => {
          const poolFee = fees.get(row.coin.address.toLowerCase());
          if (!poolFee) return { ...row, poolFee: undefined };
          try {
            const { out } = await quoteSell(
              row.coin.address,
              poolFee,
              row.balance,
            );
            return { ...row, poolFee, quoteWei: out };
          } catch {
            // A pool that will not quote is a coin you hold and cannot sell
            // here. Say so on the card rather than hiding the holding.
            return { ...row, poolFee };
          }
        }),
      );
      setRows(priced);
    } catch (loadError) {
      console.error(loadError);
      setError(friendlyError(loadError));
    }
  }, [address]);

  useEffect(() => {
    if (ready) void load();
    else setRows(null);
  }, [ready, load]);

  const sell = async (row: Row) => {
    if (!row.poolFee || row.quoteWei === undefined) return;
    setBusy(row.coin.ticker);
    setError(null);
    try {
      const { minOut, out } = await quoteSell(
        row.coin.address,
        row.poolFee,
        row.balance,
      );
      const hash = await sellBack(
        row.coin.address,
        row.poolFee,
        row.balance,
        minOut,
      );
      await publicClient.waitForTransactionReceipt({ hash });
      setSold({
        wei: (out * BigInt(10000 - Math.round(SELL_FEE * 10000))) / 10000n,
        hash,
      });
      await load();
    } catch (sellError) {
      console.error(sellError);
      setError(friendlyError(sellError));
    } finally {
      setBusy(null);
    }
  };

  if (!ready) {
    return (
      <div className="mt-16 flex flex-col items-center gap-5 text-center">
        <p className="max-w-[28rem] text-[1.125rem] text-nav-text/70">
          Your coins live in your wallet, not on this page. Connect it and they
          show up here.
        </p>
        <WalletButton className="w-full max-w-[18rem]" />
      </div>
    );
  }

  if (rows === null) {
    return (
      <p className="mt-16 text-[1rem] text-nav-text/50">Reading the chain…</p>
    );
  }

  return (
    <>
      {sold && (
        <p
          className="mt-8 rounded-2xl border border-nav-accent/25 bg-nav-accent/[0.07] px-5 py-4 text-[0.9375rem] font-semibold"
          style={{ color: UP }}
        >
          +{formatEther(sold.wei)} ETH back in your wallet.{" "}
          <a
            href={explorerTx(sold.hash)}
            target="_blank"
            rel="noreferrer"
            className="font-normal text-nav-text/50 underline-offset-4 hover:underline"
          >
            View the transaction
          </a>
        </p>
      )}

      {error && (
        <p className="mt-8 max-w-[42rem] text-[0.875rem] leading-[1.6] break-words text-[#ff3a6e]">
          {error}
        </p>
      )}

      {rows.length === 0 ? (
        <div className="mt-16 flex flex-col items-center gap-5 text-center">
          <p className="text-[1.125rem] text-nav-text/70">
            Nothing in this wallet yet. Open a pack and keep what drops.
          </p>
          <Link
            href="/#packs"
            className="rounded-md bg-nav-accent px-6 py-3 text-[0.9375rem] font-semibold text-nav-accent-ink transition-opacity hover:opacity-85"
          >
            Go and pull something
          </Link>
        </div>
      ) : (
        <ul className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
          {rows.map((row) => (
            <li
              key={row.coin.ticker}
              className="flex flex-col overflow-hidden rounded-lg border border-nav-surface"
            >
              <span
                className="flex aspect-square items-center justify-center p-6"
                style={{
                  background: `radial-gradient(120% 100% at 50% 0%, ${BAND[row.coin.rarity]}22, transparent 70%)`,
                }}
              >
                <Image
                  src={AVATAR.get(row.coin.ticker) ?? row.coin.avatar}
                  alt={`$${row.coin.ticker}`}
                  width={160}
                  height={160}
                  className="aspect-square w-full max-w-[9rem] rounded-full object-cover"
                />
              </span>

              <span className="flex flex-1 flex-col gap-3 border-t border-nav-surface p-4">
                <span>
                  <span className="block truncate text-[1.0625rem] font-semibold">
                    ${row.coin.ticker}
                  </span>
                  <span
                    className="mt-0.5 block text-[0.75rem] font-semibold tracking-[0.06em]"
                    style={{ color: BAND[row.coin.rarity] }}
                  >
                    {row.coin.rarity}
                  </span>
                </span>

                <span className="flex items-end justify-between gap-3">
                  <span className="min-w-0">
                    <span className="block text-[0.6875rem] tracking-[0.08em] text-nav-text/45 uppercase">
                      Held
                    </span>
                    <span className="block truncate text-[1.125rem] font-semibold">
                      {amount(row.balance, row.decimals)}
                    </span>
                  </span>
                  <span className="text-right">
                    <span className="block text-[0.6875rem] tracking-[0.08em] text-nav-text/45 uppercase">
                      Worth
                    </span>
                    <span className="block text-[1.125rem] font-semibold">
                      {row.quoteWei === undefined
                        ? "—"
                        : `${Number(formatEther(row.quoteWei)).toFixed(4)} ETH`}
                    </span>
                  </span>
                </span>

                <button
                  type="button"
                  onClick={() => void sell(row)}
                  disabled={busy !== null || row.quoteWei === undefined}
                  className="mt-1 w-full rounded-md border border-nav-surface py-2.5 text-[0.875rem] font-semibold transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-nav-accent hover:text-nav-accent-ink disabled:opacity-40 disabled:hover:bg-transparent disabled:hover:text-nav-text"
                >
                  {busy === row.coin.ticker
                    ? "Selling…"
                    : row.quoteWei === undefined
                      ? "No market"
                      : `Sell for ${Number(
                          formatEther(
                            (row.quoteWei *
                              BigInt(10000 - Math.round(SELL_FEE * 10000))) /
                              10000n,
                          ),
                        ).toFixed(4)} ETH`}
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}
    </>
  );
};
