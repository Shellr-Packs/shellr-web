"use client";

import { PageNav } from "@/components/common/nav/page-nav";
import Image from "next/image";
import Link from "next/link";

import { ChainVault } from "@/components/common/chain/chain-vault";
import { StockHoldings } from "@/components/common/stocks/stock-holdings";
import { isLive } from "@/lib/chain/config";
import { COINS, eth } from "@/lib/packs/pool";
import { clearVault, netOfFee, sellHolding, useVault } from "@/lib/packs/vault";

/**
 * The coin's own round logo, by ticker.
 *
 * A `Holding` carries the framed card art because that is what the reveal
 * hands it, and the vault's entries are in `localStorage` — widening the stored
 * shape would leave every entry saved before today without the new field. So
 * the logo is looked up here instead of stored.
 */
const AVATAR = new Map(COINS.map((coin) => [coin.ticker, coin.avatar]));

const BAND: Record<string, string> = {
  MYTHIC: "#ff3a6e",
  LEGENDARY: "#f5c420",
  EPIC: "#a6e62c",
  RARE: "#b0bec5",
  COMMON: "#78848c",
};

const ORDER = ["MYTHIC", "LEGENDARY", "EPIC", "RARE", "COMMON"];

/**
 * `/inventory` — everything the visitor has kept.
 *
 * Laid out across the whole window rather than in a reading column. The docs
 * are a column because they are prose and a long line is hard to read; this is
 * a collection, and a collection wants to be *seen* — the card art is the
 * point, so it runs as a grid that fills the width and grows a column at a
 * time.
 *
 * Reads the same store the opener writes, so a pack kept in the overlay appears
 * here without a reload.
 */
export const InventoryView = () => {
  const { holdings, soldEth, packs, ready } = useVault();

  const held = [...holdings].sort(
    (a, b) =>
      ORDER.indexOf(a.rarity) - ORDER.indexOf(b.rarity) ||
      b.valueEth - a.valueEth,
  );
  const worth = held.reduce((sum, h) => sum + h.valueEth, 0);
  const units = held.reduce((sum, h) => sum + h.units, 0);

  // The readout counts the local store, which is only the truth while the
  // demonstration is the product. Live, the numbers live on the chain and the
  // cards below carry them, so the strip would be four stale zeroes.
  const figures: Array<[string, string]> = isLive
    ? []
    : [
        ["Held", eth(worth)],
        ["Coins", String(units)],
        ["Sold", eth(soldEth)],
        ["Packs opened", String(packs)],
      ];

  return (
    <main className="min-h-dvh bg-black px-6 pt-6 pb-10 font-sans text-nav-text sm:px-10 sm:pt-7 sm:pb-14">
      <div className="mx-auto w-full max-w-[100rem]">
        {/* Pulled left of the column and up towards the top edge: it is the way
            out of this page, not a heading for it, and it reads as a mark
            rather than as a line of text. */}
        <Link
          href="/"
          className="-ml-2 inline-flex items-center gap-3 text-[1rem] font-semibold text-nav-accent transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-70 sm:-ml-4"
        >
          <Image
            src="/assets/brand/shellr-mark-v93.png"
            alt=""
            width={704}
            height={768}
            className="w-[1.925rem] [image-rendering:pixelated]"
            priority
          />
          ← Back to Shellr
        </Link>

        <PageNav />

        {/* Title and counters share a row on a wide window - the four figures
            are a readout, not a section, and stacking them under the heading
            pushed the collection itself below the fold. */}
        <div className="mt-8 flex flex-col gap-8 border-b border-nav-surface pb-8 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <h1 className="font-display text-[3.25rem] leading-[var(--leading-display)] font-semibold text-nav-accent sm:text-[4.5rem]">
              Your vault
            </h1>
            <p className="mt-2 text-[0.9375rem] text-nav-text/55">
              Everything you kept instead of selling.
            </p>
          </div>

          <dl className="grid grid-cols-2 gap-3 empty:hidden sm:grid-cols-4 xl:w-[42rem]">
            {figures.map(([label, figure]) => (
              <div
                key={label}
                className="rounded-md border border-nav-surface px-4 py-3"
              >
                <dt className="text-[0.6875rem] font-semibold tracking-[0.08em] text-nav-text/45 uppercase">
                  {label}
                </dt>
                <dd className="mt-1 text-[1.25rem] font-semibold">{figure}</dd>
              </div>
            ))}
          </dl>
        </div>

        {/* Live, the vault is the wallet: balances read from the chain, sold
            through the contract. The local store below is the demonstration,
            and the two never show at once. */}
        {isLive && <ChainVault />}

        {!isLive && ready && held.length === 0 && (
          <div className="mt-24 flex flex-col items-center gap-5 text-center">
            <p className="text-[1.125rem] text-nav-text/70">
              Nothing in here yet. Open a pack and keep what drops.
            </p>
            <Link
              href="/#packs"
              className="rounded-md bg-nav-accent px-6 py-3 text-[0.9375rem] font-semibold text-nav-accent-ink transition-opacity hover:opacity-85"
            >
              Go and pull something
            </Link>
          </div>
        )}

        {!isLive && held.length > 0 && (
          <>
            <ul className="mt-10 grid grid-cols-[repeat(auto-fill,minmax(15rem,1fr))] gap-5">
              {held.map((holding) => (
                <li
                  key={holding.ticker}
                  className="flex flex-col overflow-hidden rounded-lg border border-nav-surface"
                >
                  {/* The coin's own logo, square, on a wash of its band colour.
                      The tall card art was the pack's packaging; what you hold
                      is the token, and a token has one square mark. */}
                  <span
                    className="flex aspect-square items-center justify-center p-6"
                    style={{
                      background: `radial-gradient(120% 100% at 50% 0%, ${BAND[holding.rarity]}22, transparent 70%)`,
                    }}
                  >
                    <Image
                      src={AVATAR.get(holding.ticker) ?? holding.art}
                      alt={`$${holding.ticker}`}
                      width={160}
                      height={160}
                      className="aspect-square w-full max-w-[9rem] rounded-full object-cover"
                    />
                  </span>

                  <span className="flex flex-1 flex-col gap-3 border-t border-nav-surface p-4">
                    <span>
                      <span className="block truncate text-[1.0625rem] font-semibold">
                        ${holding.ticker}
                      </span>
                      <span
                        className="mt-0.5 block text-[0.75rem] font-semibold tracking-[0.06em]"
                        style={{ color: BAND[holding.rarity] }}
                      >
                        {holding.rarity}
                      </span>
                    </span>

                    <span className="flex items-end justify-between gap-3">
                      <span>
                        <span className="block text-[0.6875rem] tracking-[0.08em] text-nav-text/45 uppercase">
                          Units
                        </span>
                        <span className="block text-[1.125rem] font-semibold">
                          ×{holding.units}
                        </span>
                      </span>
                      <span className="text-right">
                        <span className="block text-[0.6875rem] tracking-[0.08em] text-nav-text/45 uppercase">
                          Value
                        </span>
                        <span className="block text-[1.125rem] font-semibold">
                          {eth(holding.valueEth)}
                        </span>
                      </span>
                    </span>

                    <button
                      type="button"
                      onClick={() => sellHolding(holding.ticker)}
                      className="mt-1 w-full rounded-md border border-nav-surface py-2.5 text-[0.875rem] font-semibold transition-colors duration-[var(--duration-fast)] ease-entrance hover:bg-nav-accent hover:text-nav-accent-ink"
                    >
                      Sell for {eth(netOfFee(holding.valueEth))}
                    </button>
                  </span>
                </li>
              ))}
            </ul>

            <button
              type="button"
              onClick={clearVault}
              className="mt-10 text-[0.8125rem] text-nav-text/40 underline transition-opacity hover:opacity-70"
            >
              Clear vault
            </button>
          </>
        )}

        <StockHoldings />

        <p className="mt-16 max-w-[46rem] border-t border-nav-surface pt-6 text-[0.8125rem] leading-[1.6] text-nav-text/45">
          {isLive
            ? "Your coins are ERC-20s in your own wallet, not held here. This page reads their balances from the chain, so they follow the wallet - another browser, another machine, same coins."
            : "This vault lives in this browser, not on a chain. Clearing your site data empties it and it will not follow you to another device."}
        </p>
      </div>
    </main>
  );
};
