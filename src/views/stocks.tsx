"use client";

import { PageNav } from "@/components/common/nav/page-nav";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";

import {
  StockPack,
  TICKER_META,
  TickerMark,
  symbolOf,
} from "@/components/common/stocks/stock-pack";
import { readStockConfig, stocksLive } from "@/lib/chain/stock-packs";

/**
 * `/stocks` — a pack that drops tokenized equities instead of memes.
 *
 * Same shape as `/launchpad` and `/battles`, and for the same reason: a board
 * that will have rows on it later is a board now, sized so the first real row
 * does not make the page jump.
 *
 * **Nothing here takes money, and nothing claims a partnership.** The router
 * this would run on is Voxelithic's, and their integration is a published npm
 * package against a public contract - which is a thing Shellr can point at
 * without anybody's permission, and a very different thing from a joint
 * announcement. The copy says "routes through", never "together with", until
 * there is something signed to say otherwise.
 */

const glass: CSSProperties = {
  background:
    "linear-gradient(152deg, rgba(255,255,255,0.09), rgba(255,255,255,0.025) 40%, rgba(214,216,219,0.045))",
  backdropFilter: "blur(40px) saturate(160%)",
  WebkitBackdropFilter: "blur(40px) saturate(160%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -1px 0 rgba(255,255,255,0.05), 0 30px 90px rgba(0,0,0,0.6)",
};

/**
 * The lineup, taken from what Voxelithic's book actually quotes on chain 4663.
 *
 * Names are here so a visitor who does not read tickers still knows what they
 * are looking at, and `pools` is the count their docs publish - depth is the
 * thing that decides whether a pack can fill at all, so it is on the card
 * rather than buried.
 */
const TICKERS = [
  { symbol: "NVDA", name: "Nvidia", pools: 14 },
  { symbol: "SPY", name: "S&P 500", pools: 17 },
  { symbol: "TSLA", name: "Tesla", pools: 7 },
  { symbol: "AAPL", name: "Apple", pools: 6 },
  { symbol: "GOOGL", name: "Alphabet", pools: 6 },
  { symbol: "MSTR", name: "Strategy", pools: 5 },
  { symbol: "META", name: "Meta", pools: 5 },
  { symbol: "COIN", name: "Coinbase", pools: 5 },
  { symbol: "MU", name: "Micron", pools: 5 },
  { symbol: "TSM", name: "TSMC", pools: 4 },
  { symbol: "AMD", name: "AMD", pools: 3 },
  { symbol: "PLTR", name: "Palantir", pools: 3 },
  { symbol: "QQQ", name: "Nasdaq 100", pools: 3 },
  { symbol: "NFLX", name: "Netflix", pools: 2 },
  { symbol: "AMZN", name: "Amazon", pools: null },
];

const HOW = [
  {
    title: "Buy the pack in ETH",
    body: "One price, same as a meme pack. The stake minus the 2% fee is what goes to work.",
  },
  {
    title: "The router finds the fill",
    body: "Voxelithic quotes every venue holding the ticker and takes the best one. Their quoter asks the pools for a real number instead of modelling it.",
  },
  {
    title: "Shares land in your wallet",
    body: "Tokenized equity, held by you, tradeable the moment it arrives. Nothing sits in an account here.",
  },
];

export const StocksView = () => {
  const [opening, setOpening] = useState(false);

  /*
   * The lineup, read from the contract.
   *
   * `TICKERS` below is every ticker Voxelithic quotes, which is not the same
   * as what a pack can hand you - a ticker with no route from WETH, or one
   * whose liquidity has moved to v4, never gets listed. The page used to print
   * all fifteen under "What can drop" while the contract held six, which is a
   * promise the pack could not keep.
   */
  const [listed, setListed] = useState<string[] | null>(null);

  useEffect(() => {
    if (!stocksLive) return;
    let live = true;
    readStockConfig()
      .then((config) => {
        if (!live) return;
        setListed(
          config.stocks.filter((s) => s.live).map((s) => symbolOf(s.token)),
        );
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);

  const shown = listed
    ? TICKERS.filter((t) => listed.includes(t.symbol))
    : TICKERS;

  return (
    <main className="min-h-dvh bg-black px-6 pt-6 pb-10 font-sans text-nav-text sm:px-10 sm:pt-7 sm:pb-14">
      <div
        aria-hidden="true"
        className="pointer-events-none fixed inset-0 -z-10"
        style={{
          background:
            "radial-gradient(60rem 40rem at 70% -10%, rgba(214,216,219,0.09), transparent 70%), radial-gradient(40rem 30rem at 10% 20%, rgba(214,216,219,0.05), transparent 70%)",
        }}
      />

      <div className="mx-auto w-full max-w-[100rem]">
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

        <div className="mt-10 flex flex-col gap-8 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-nav-text/45 uppercase">
              {stocksLive ? "Live" : "Not live yet"}
            </p>
            <h1 className="font-display mt-2 text-[3.5rem] leading-[0.92] font-semibold text-nav-accent sm:text-[5.5rem]">
              Stock Packs
            </h1>
            <p className="mt-4 max-w-[34rem] text-[1.0625rem] leading-[1.6] text-nav-text/60">
              Same sealed pack, different contents. Tear it open and tokenized
              shares drop instead of memes — routed through Voxelithic&apos;s
              book across every venue on the chain.
            </p>
          </div>

          {/*
           * The set, filling the gap between the copy and the button.
           *
           * Decorative, so it carries no controls and no sound: `muted` is
           * what lets `autoPlay` run at all on every current browser, and
           * `playsInline` stops iOS taking it fullscreen the moment it starts.
           * `poster` covers the first frames on a slow connection - without it
           * the slot is a black rectangle that reads as a layout bug.
           *
           * Hidden below `lg`: on a narrow screen the header is already two
           * stacked blocks, and a third pushes the button under the fold.
           */}
          <video
            src="/assets/stocks/tv.mp4"
            poster="/assets/stocks/tv-poster.jpg"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-hidden="true"
            tabIndex={-1}
            className="pointer-events-none hidden w-[22rem] rounded-[1.25rem] mix-blend-lighten lg:block xl:w-[26rem]"
          />

          <button
            type="button"
            onClick={() => setOpening(true)}
            className="shrink-0 rounded-xl bg-nav-accent px-7 py-4 text-[1rem] font-semibold text-nav-accent-ink transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-85"
          >
            Open Pack
          </button>
        </div>

        <section className="mt-12">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[0.75rem] font-semibold tracking-[0.12em] text-nav-text/45 uppercase">
              What can drop
            </h2>
            <span className="text-[0.75rem] text-nav-text/30">
              Pool counts from Voxelithic&apos;s book
            </span>
          </div>

          <ul className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] sm:grid-cols-3 lg:grid-cols-4">
            {TICKERS.map((ticker) => (
              <li key={ticker.symbol} style={glass} className="px-5 py-5">
                <TickerMark symbol={ticker.symbol} size={36} />
                <p className="font-display mt-3 text-[1.5rem] leading-none font-semibold">
                  {ticker.symbol}
                </p>
                <p className="mt-1.5 text-[0.8125rem] text-nav-text/50">
                  {ticker.name}
                </p>
                <p className="mt-3 text-[0.6875rem] tracking-[0.1em] text-nav-text/30 uppercase">
                  {ticker.pools === null ? "reading" : `${ticker.pools} pools`}
                </p>
              </li>
            ))}
          </ul>
        </section>

        <section className="mt-14">
          <h2 className="text-[0.75rem] font-semibold tracking-[0.12em] text-nav-text/45 uppercase">
            How a stock pack works
          </h2>

          <ol className="mt-4 grid gap-px overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] lg:grid-cols-3">
            {HOW.map((step, index) => (
              <li key={step.title} style={glass} className="px-6 py-7">
                <span className="font-display text-[2rem] leading-none font-semibold text-nav-text/25">
                  {index + 1}
                </span>
                <p className="mt-3 text-[0.9375rem] font-semibold">
                  {step.title}
                </p>
                <p className="mt-2 text-[0.8125rem] leading-[1.6] text-nav-text/50">
                  {step.body}
                </p>
              </li>
            ))}
          </ol>

          <p className="mt-5 max-w-[46rem] text-[0.8125rem] leading-[1.7] text-nav-text/40">
            Shellr routes through Voxelithic the way anyone can: their router
            and token registry are published as a package that checks itself
            against the chain, so a ticker resolves to the address they
            actually execute against rather than whatever an indexer returns.
            On this chain that matters: thirty-nine contracts answer to a
            stock ticker that is not theirs, and the deepest of them holds over
            half a million dollars of liquidity while trading pennies a day. A
            pack that resolved tickers by search would eventually drop one of
            those instead of the share you paid for.
          </p>
        </section>
      </div>

      <StockPack open={opening} onClose={() => setOpening(false)} />
    </main>
  );
};
