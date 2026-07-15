"use client";

import { formatEther, parseEther } from "viem";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import { explorerTx } from "@/lib/chain/config";
import { DOWN, UP, pnl } from "@/lib/packs/format";
import { WalletButton } from "@/components/common/chain/wallet-button";
import { onRightChain, useWallet } from "@/lib/chain/wallet";
import {
  buyStockPack,
  friendlyError,
  readStockConfig,
  stocksLive,
  waitForStockReveal,
  type StockConfig,
  type StockPull,
} from "@/lib/chain/stock-packs";

/**
 * The stock pack, opened.
 *
 * The same four stages the meme pack runs — what am I buying, wait, tear, what
 * did I get — because a buyer who has opened one should not have to learn a
 * second interface for the other.
 *
 * Where it differs is the wait. A meme pack settles in one hop through a pool
 * the contract already knows. This one has to be quoted off-chain first, and
 * the keeper is allowed to fail on slippage and retry twice, so `paying` can
 * sit for the better part of a minute on a thin ticker. The copy says that
 * rather than showing a spinner that reads as stuck.
 */

/**
 * What each ticker looks like.
 *
 * `brand` is the fallback tile's colour, used when no logo file is present.
 * Logos live at `/assets/stocks/<SYMBOL>.png`, lifted from `us-stock-logos`
 * (MIT) and copied into `public/` rather than imported - the package carries
 * twelve thousand files and we need thirteen.
 *
 * SPY and QQQ are the two without one: the package covers stocks and ADRs
 * well and index ETFs badly. They fall back to the tile, which is why the
 * fallback is a real design and not an apology.
 */
export const TICKER_META: Record<string, { name: string; brand: string }> = {
  NVDA: { name: "Nvidia", brand: "#76b900" },
  SPY: { name: "S&P 500", brand: "#c9a227" },
  AAPL: { name: "Apple", brand: "#8e8e93" },
  TSLA: { name: "Tesla", brand: "#cc0000" },
  GOOGL: { name: "Alphabet", brand: "#4285f4" },
  META: { name: "Meta", brand: "#0866ff" },
  MSTR: { name: "Strategy", brand: "#f4901e" },
  COIN: { name: "Coinbase", brand: "#0052ff" },
  MU: { name: "Micron", brand: "#0d4f8b" },
  TSM: { name: "TSMC", brand: "#c8102e" },
  AMD: { name: "AMD", brand: "#ed1c24" },
  PLTR: { name: "Palantir", brand: "#5a5a5a" },
  QQQ: { name: "Nasdaq 100", brand: "#0096d6" },
  NFLX: { name: "Netflix", brand: "#e50914" },
  AMZN: { name: "Amazon", brand: "#ff9900" },
};

export const SYMBOL_BY_ADDRESS: Record<string, string> = {
  "0xd0601ce157db5bdc3162bbac2a2c8af5320d9eec": "NVDA",
  "0x117cc2133c37b721f49de2a7a74833232b3b4c0c": "SPY",
  "0xaf3d76f1834a1d425780943c99ea8a608f8a93f9": "AAPL",
  "0x58ffe4a942d3885baa22d7520691f611ef09e7aa": "TSM",
  "0xec262a75e413fafd0df80480274532c79d42da09": "MSTR",
  "0x2e0847e8910a9732eb3fb1bb4b70a580adad4fe3": "GOOGL",
  "0x6330d8c3178a418788df01a47479c0ce7ccf450b": "COIN",
  "0xff080c8ce2e5feadaca0da81314ae59d232d4afd": "MU",
  "0x322f0929c4625ed5bad873c95208d54e1c003b2d": "TSLA",
  "0xc0d6457c16cc70d6790dd43521c899c87ce02f35": "META",
  "0x894e1ec2d74ffe5aef8dc8a9e84686accb964f2a": "PLTR",
  "0xd5f3879160bc7c32ebb4dc785f8a4f505888de68": "QQQ",
  "0x86923f96303d656e4aa86d9d42d1e57ad2023fdc": "AMD",
  "0xe0444ef8bf4ed74f74fd73686e2ddf4c1c5591e8": "NFLX",
  "0x12f190a9f9d7d37a250758b26824b97ce941bf54": "AMZN",
};

export const symbolOf = (token: string) =>
  SYMBOL_BY_ADDRESS[token.toLowerCase()] ?? "SHARE";

/**
 * A ticker's mark.
 *
 * Tries the logo file first and falls back to a lettered tile in the company's
 * colour. `failed` is state rather than an `onError` attribute alone because a
 * second render must not retry a file that already 404'd.
 */
export const TickerMark = ({
  symbol,
  size = 40,
}: {
  symbol: string;
  size?: number;
}) => {
  const [failed, setFailed] = useState(false);
  const meta = TICKER_META[symbol];

  if (failed || !meta) {
    return (
      <span
        aria-hidden="true"
        style={{
          width: size,
          height: size,
          background: meta?.brand ?? "rgba(255,255,255,0.12)",
          fontSize: size * 0.3,
        }}
        className="grid shrink-0 place-items-center rounded-[0.55rem] font-semibold text-white/95"
      >
        {symbol.slice(0, 4)}
      </span>
    );
  }

  return (
    // Local file, nothing for the image optimiser to fetch.
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`/assets/stocks/${symbol}.png`}
      alt=""
      width={size}
      height={size}
      onError={() => setFailed(true)}
      // No tile behind it. Every logo in the set is RGBA with a genuinely
      // empty alpha, so a background only shows up as a grey square around a
      // mark that was already the right shape.
      className="shrink-0 object-contain"
      style={{ width: size, height: size }}
    />
  );
};

type Stage = "buy" | "paying" | "opening" | "opened";

export const StockPack = ({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) => {
  const address = useWallet((state) => state.address);
  const chainId = useWallet((state) => state.chainId);

  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState<Stage>("buy");
  const [config, setConfig] = useState<StockConfig | null>(null);
  const [typed, setTyped] = useState("0.01");
  const [pull, setPull] = useState<StockPull | null>(null);
  // Held until the film has run. The chain answers in a second or in a minute
  // and the clip is the same length either way, so the result waits here and
  // the film decides when it is shown.
  const held = useRef<StockPull | null>(null);
  const opened = useRef(false);
  const [hash, setHash] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open || !stocksLive) return;
    readStockConfig()
      .then(setConfig)
      .catch(() => setConfig(null));
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape" && stage !== "paying") onClose();
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, [open, onClose, stage]);

  /**
   * End the film, show the drop.
   *
   * Four things can finish it - the clip ending, the clip erroring, a click, or
   * the clock - and the guard is what stops any two of them landing the reveal
   * twice. Autoplay can be refused without firing a single event, so the clock
   * is not a fallback so much as the only one that always arrives.
   */
  const finishOpening = useCallback(() => {
    if (opened.current) return;
    opened.current = true;
    setPull(held.current);
    setStage("opened");
  }, []);

  useEffect(() => {
    if (stage !== "opening") return;
    const timer = window.setTimeout(finishOpening, 6000);
    return () => window.clearTimeout(timer);
  }, [stage, finishOpening]);

  if (!open || !mounted) return null;

  const ready = address && onRightChain(chainId);

  // Limits come from the contract once it exists; before that the numbers the
  // contract is deployed with stand in, so the placeholder never advertises a
  // range the chain will reject.
  const minEth = config ? formatEther(config.minWei) : "0.005";
  const maxEth = config ? formatEther(config.maxWei) : "0.05";

  /**
   * Clamp as they type, not on submit.
   *
   * A stake silently corrected at the moment of signing is a stake the buyer
   * did not choose. Correcting here means the fee rows and the total they read
   * are the ones they will actually pay.
   */
  const type = (value: string) => {
    setTyped(value.replace(/[^0-9.]/g, ""));
    setError(null);
  };

  const parsed = Number.parseFloat(typed);
  const stake = Number.isFinite(parsed) ? parsed : 0;
  // Before a deployment there is nothing to read a lineup from, so the full
  // set stands in - the panel is then a preview of the real thing rather than
  // an empty box that looks broken.
  // With the contract read, this is the real listing. Without it, the full set
  // stands in so the panel is a preview rather than an empty box - which means
  // a lineup longer than the contract's is itself the sign that the read
  // failed, and `lineupIsLive` says so out loud.
  const lineupIsLive = Boolean(config);
  const lineup = config
    ? config.stocks.filter((entry) => entry.live).map((entry) => symbolOf(entry.token))
    : Object.keys(TICKER_META);

  const go = async () => {
    setError(null);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      setError("That is not an amount.");
      return;
    }
    if (config && (parsed < Number(minEth) || parsed > Number(maxEth))) {
      setError(`A pack is ${minEth} to ${maxEth} ETH.`);
      return;
    }
    // Two different failures that used to share one sentence. "Not deployed"
    // while the contract was live and merely unread sent us hunting a missing
    // environment variable that was already there.
    if (!stocksLive) {
      setError(
        "The stock pack contract is written but not deployed. Nothing here would take your ETH.",
      );
      return;
    }
    if (!config) {
      setError(
        "Could not read the contract just now — the RPC did not answer. Reload and try again.",
      );
      return;
    }
    setStage("paying");
    try {
      const pack = await buyStockPack(parseEther(typed));
      setHash(pack.hash);
      const result = await waitForStockReveal(pack);
      // Known, not shown. The pack is already open on chain; the film is what
      // the buyer gets to watch before finding out.
      held.current = result;
      opened.current = false;
      setStage("opening");
    } catch (caught) {
      setError(friendlyError(caught));
      setStage("buy");
    }
  };

  const reset = () => {
    setStage("buy");
    setPull(null);
    setHash(null);
    setError(null);
  };

  const fee = stake * 0.02;

  /*
   * While the pack is opening there is no panel at all.
   *
   * The panel is a place to read numbers; the film is not. Drawn inside it,
   * the clip sat in a grey box under a header and stopped looking like a pack
   * being opened. So the panel steps out and the room behind it blurs.
   *
   * The clip is portrait, so it is sized by height - the full window - and
   * whatever is left either side is the blurred page.
   */
  if (stage === "opening") {
    return createPortal(
      <div
        onClick={finishOpening}
        role="dialog"
        aria-modal="true"
        aria-label="Opening the pack"
        className="pons-fade fixed inset-0 z-[80] flex cursor-pointer items-center justify-center bg-black/35 font-sans backdrop-blur-2xl"
      >
        <video
          src="/assets/stocks/unbox.mp4"
          autoPlay
          muted
          playsInline
          preload="auto"
          onEnded={finishOpening}
          onError={finishOpening}
          className="h-dvh w-auto max-w-none"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center gap-1.5 sm:bottom-14">
          <span className="text-[0.8125rem] text-white/45">
            Tap to see what dropped
          </span>
          {hash && (
            <a
              href={explorerTx(hash)}
              target="_blank"
              rel="noreferrer noopener"
              onClick={(event) => event.stopPropagation()}
              className="pointer-events-auto text-[0.6875rem] text-white/35 underline-offset-4 hover:underline"
            >
              View the transaction
            </a>
          )}
        </div>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      onPointerDown={(event) => {
        if (event.target === event.currentTarget && stage !== "paying") onClose();
      }}
      className="pons-fade fixed inset-0 z-[75] flex items-center justify-center overflow-y-auto bg-black/88 px-4 py-8 font-sans text-nav-text backdrop-blur-lg"
    >
      <div className="pons-rise relative w-full max-w-[46rem] rounded-[1.75rem] border border-white/14 bg-nav-panel p-6 outline-none sm:p-9">
        {stage !== "paying" && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-5 right-5 z-20 grid size-9 place-items-center rounded-full bg-white/[0.07] text-nav-text/60 transition-colors hover:bg-white/[0.13] hover:text-nav-text"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="size-4">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        )}

        <div className="relative z-10">
          {stage === "buy" && (
            <>
              <p className="text-[0.6875rem] tracking-[0.28em] text-nav-accent/80 uppercase">
                Voxelithic book
              </p>
              <h2 className="font-display mt-1 text-[2.75rem] leading-[var(--leading-display)] font-semibold text-nav-accent uppercase">
                Stock Pack
              </h2>
              <p className="mt-2 max-w-[34rem] text-[0.875rem] leading-[1.5] text-nav-text/60">
                Name your stake and tear it open. One tokenized share from the
                lineup lands in your wallet — which company, and how much of
                it, are both sealed until you open it.
              </p>

              <div className="mt-7 grid gap-7 sm:min-h-[27rem] sm:grid-cols-[17rem_1fr] sm:items-start sm:gap-8">
                {/*
                 * The pack front, sealed and still.
                 *
                 * The clip belongs to the wait, not to this screen. Playing it
                 * here spends the one moment of motion the flow has before the
                 * buyer has done anything, and leaves the actual wait - the
                 * part that needs covering - as a line of text.
                 */}
                <div className="flex justify-center sm:justify-start">
                  <Image
                    src="/assets/stocks/pack-front.png"
                    alt="Shellr stocks pack"
                    width={1086}
                    height={1448}
                    className="w-full max-w-[18rem] drop-shadow-[0_20px_60px_rgba(0,0,0,0.7)]"
                    priority
                  />
                </div>

                <div>
                  {/*
                   * What is inside, not what to pick.
                   *
                   * The ticker is drawn from the same seed as the payout, so
                   * this is a lineup rather than a menu. Rendering it as
                   * buttons would promise a choice the contract does not offer.
                   */}
                  <p className="text-[0.6875rem] font-semibold tracking-[0.1em] text-nav-text/45 uppercase">
                    What is inside
                  </p>
                  <ul className="mt-2 flex max-h-[9.5rem] flex-wrap gap-2 overflow-y-auto pr-1">
                    {lineup.map((symbol) => (
                      <li
                        key={symbol}
                        className="flex items-center gap-2 rounded-xl bg-white/[0.04] px-2.5 py-2"
                      >
                        <TickerMark symbol={symbol} size={22} />
                        <span className="text-[0.8125rem] font-semibold text-nav-text/70">
                          {symbol}
                        </span>
                      </li>
                    ))}
                  </ul>
                  <p className="mt-2 text-[0.75rem] leading-[1.5] text-nav-text/35">
                    {lineupIsLive
                      ? "One of these drops. Which one, and how much of it, are both settled when the pack is opened."
                      : "Showing the full set — the live lineup could not be read from the contract just now."}
                  </p>

                  <input
                    inputMode="decimal"
                    value={typed}
                    onChange={(event) => type(event.target.value)}
                    placeholder={`Custom amount (${minEth}-${maxEth} ETH)`}
                    className="mt-4 w-full rounded-xl border border-white/12 bg-black/40 px-4 py-3 text-[0.9375rem] text-nav-text outline-none placeholder:text-nav-text/35 focus:border-nav-accent/60"
                  />

                  <p className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-[0.8125rem] leading-[1.6] text-nav-text/60">
                    What drops is a real tokenized share, issued on Robinhood
                    Chain and backed by the stock itself — not a wrapper or a
                    tracker. It lands in your wallet as an ERC-20 you can hold,
                    move or sell anywhere.
                  </p>

                  <dl className="mt-4 flex flex-col gap-1.5 text-[0.8125rem]">
                    <div className="flex justify-between">
                      <dt className="text-nav-text/50">Shellr fee (2%)</dt>
                      <dd>{fee.toFixed(4)} ETH</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-nav-text/50">Spent on shares</dt>
                      <dd>{(stake - fee).toFixed(4)} ETH</dd>
                    </div>
                    <div className="mt-1 flex justify-between border-t border-white/10 pt-2 text-[0.9375rem] font-semibold">
                      <dt>You pay</dt>
                      <dd>{stake} ETH</dd>
                    </div>
                  </dl>

                  {stocksLive && <WalletButton className="mt-5" />}
                  {(!stocksLive || ready) && (
                    <button
                      type="button"
                      onClick={go}
                      className="mt-5 w-full rounded-xl bg-nav-accent px-5 py-3.5 text-[0.9375rem] font-semibold text-nav-accent-ink transition-opacity hover:opacity-85"
                    >
                      Open pack
                    </button>
                  )}

                  {error && (
                    <p className="mt-3 text-[0.8125rem] leading-[1.5] break-words text-nav-accent">
                      {error}
                    </p>
                  )}

                  <p className="mt-3 text-center text-[0.75rem] text-nav-text/35">
                    Shares are delivered by the swap, straight to your wallet.
                  </p>
                </div>
              </div>
            </>
          )}

          {stage === "paying" && (
            <div className="py-16 text-center">
              <p className="font-display text-[1.75rem] leading-none font-semibold">
                Settling the draw
              </p>
              <p className="mx-auto mt-3 max-w-[24rem] text-[0.875rem] leading-[1.6] text-nav-text/50">
                The keeper is quoting the swap across every venue holding
                whatever came out. On a thin ticker it may widen its tolerance
                and try again, so this can take up to a minute.
              </p>
            </div>
          )}

          {stage === "opened" && pull && (
            <>
              <p className="text-[0.6875rem] tracking-[0.28em] text-nav-accent/80 uppercase">
                You pulled
              </p>

              <div className="mt-5 flex items-center gap-5">
                <TickerMark symbol={symbolOf(pull.token)} size={72} />
                <div className="min-w-0">
                  <p className="font-display text-[3rem] leading-none font-semibold">
                    {Number(pull.amount).toFixed(4)}
                  </p>
                  <p className="mt-1.5 text-[1rem] text-nav-accent">
                    {symbolOf(pull.token)} ·{" "}
                    {TICKER_META[symbolOf(pull.token)]?.name}
                  </p>
                </div>
              </div>

              {/*
               * Where the pack landed against what it cost.
               *
               * Read off `spend` against `stake` rather than off the roll: the
               * roll is what the contract decided, `spend` is what actually
               * went through the swap, and the second is the number the buyer
               * lived. They differ by the fee, and hiding the fee inside a
               * multiplier is how a sheet ends up quoting a better day than
               * the wallet had.
               */}
              <div className="mt-6 flex items-baseline gap-2 border-t border-white/10 pt-4">
                <span className="text-[0.8125rem] text-nav-text/50">
                  Paid {formatEther(pull.stakeWei)} ETH · worth about{" "}
                  {formatEther(pull.spendWei)} ETH
                </span>
                <span
                  className="ml-auto font-display text-[1.5rem] leading-none font-semibold"
                  style={{
                    color:
                      pull.spendWei >= pull.stakeWei ? UP : DOWN,
                  }}
                >
                  {pnl(Number(pull.spendWei), Number(pull.stakeWei))}
                </span>
              </div>

              <p className="mt-2 text-[0.75rem] leading-[1.5] text-nav-text/35">
                Rolled {(pull.mult / 10000).toFixed(2)}× on the sheet, less the
                2% fee. The shares are in your wallet already — what they are
                worth from here is the market&apos;s business, not the
                pack&apos;s.
              </p>

              <div className="mt-7 flex gap-3">
                <button
                  type="button"
                  onClick={reset}
                  className="rounded-xl bg-nav-accent px-6 py-3 text-[0.875rem] font-semibold text-nav-accent-ink transition-opacity hover:opacity-85"
                >
                  Open another
                </button>
                <a
                  href="/inventory"
                  className="rounded-xl border border-white/15 px-6 py-3 text-[0.875rem] font-semibold transition-opacity hover:opacity-70"
                >
                  Sell
                </a>
                {hash && (
                  <a
                    href={explorerTx(hash)}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="rounded-xl border border-white/15 px-6 py-3 text-[0.875rem] font-semibold transition-opacity hover:opacity-70"
                  >
                    Receipt
                  </a>
                )}
              </div>
            </>
          )}

        </div>
      </div>
    </div>,
    document.body,
  );
};
