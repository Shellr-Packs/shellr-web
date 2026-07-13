"use client";

import Image from "next/image";
import Link from "next/link";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { formatUnits } from "viem";

import { eth, totalEth, type Pull } from "@/lib/packs/pool";
import {
  FEE_RATE,
  MAX_STAKE,
  MIN_STAKE,
  PRESETS,
  openPonsPack,
  stakeCost,
} from "@/lib/packs/pons";
import { AVATAR, DOWN, UP, coinAmount, pnl } from "@/lib/packs/format";
import { WalletButton } from "@/components/common/chain/wallet-button";
import { explorerTx, isLive } from "@/lib/chain/config";
import {
  buyPack,
  buyPackWithToken,
  friendlyError,
  readTokenCost,
  readTokenSale,
  refundPack,
  type TokenSaleState,
  quoteSell,
  readPackConfig,
  readPoolFees,
  sellBack,
  waitForReveal,
  type ChainPull,
} from "@/lib/chain/packs";
import { onRightChain, useWallet } from "@/lib/chain/wallet";
import { SELL_FEE, keepPulls, netOfFee, sellPulls } from "@/lib/packs/vault";

export interface PonsPackProps {
  /** Walk to the next pack in the ring: `1` forward, `-1` back. */
  onStep?: (delta: number) => void;
  open: boolean;
  onClose: () => void;
}

/**
 * The two arrows either side of a sheet.
 *
 * Chevrons drawn rather than typed: the arrow glyphs sit off-centre in Chakra
 * Petch and the two are not mirror images of each other, which shows the moment
 * they are put in matching circles.
 */
const STEP =
  "pointer-events-auto grid size-11 place-items-center rounded-full border border-white/15 bg-black/60 text-nav-text/60 shadow-[0_8px_24px_rgba(0,0,0,0.5)] backdrop-blur-md transition-all duration-[var(--duration-fast)] ease-entrance hover:scale-105 hover:border-white/30 hover:bg-black/80 hover:text-nav-text active:scale-95";

/** Band colours — the same five the cards are printed in. */
const BAND: Record<string, string> = {
  MYTHIC: "#ff3a6e",
  LEGENDARY: "#f5c420",
  EPIC: "#a6e62c",
  RARE: "#b0bec5",
  COMMON: "#78848c",
};

/**
 * `paying` exists because the film is not the purchase.
 *
 * The tear used to start the moment the button was pressed, which made the
 * theatre run while the wallet was still asking - and if the wallet was never
 * connected at all, the pack "opened" on numbers rolled in the browser. A pack
 * that is live has one order and only one: pay, wait for the block, then watch.
 */
type Stage = "buy" | "paying" | "opening" | "reveal" | "done";

/** The photographed pack, cut out of its background. */
const PONS_PACK_ART = "/assets/packs-art/pons-pack-v84.webp";

/** The tear, filmed. */
const PONS_PACK_VIDEO = "/assets/packs-open/pons-open-v73.mp4";

/**
 * Seconds into the clip at which the wrapper has left frame.
 *
 * Read off it frame by frame: the seal splits at about 2.7s and the last of the
 * foil is clear of the card by 3.8. Cutting there hands the sheet over on the
 * beat the film lands rather than after a pause.
 */
const REVEAL_AT = 3.8;

/**
 * The Pons Pack sheet — the site's one buy flow that is not a fixed tier.
 *
 * Four stages, the same four the tier theatre runs: what am I buying, wait,
 * here is what dropped, what do you want done with it.
 *
 * The panel is glass over the room rather than a plate laid on top of it: the
 * scene behind stays legible through it, which is the only reason to hold a
 * WebGL room still behind a dialog at all. Two things make it read as glass
 * rather than as a grey box — the blur takes the *saturation* up as well, and a
 * highlight tracks the pointer across the surface, so the panel has a light
 * source instead of a gradient. Both are cheap; neither is animated on a timer.
 *
 * What it does **not** show is what is inside. A sheet that lists the coins a
 * stake can reach, and how many of them drop, has described the contents of a
 * sealed pack — and a range printed beside a price reads as a promise the draw
 * never made. The odds are published in the docs; the pack stays shut.
 */
export const PonsPack = ({ open, onClose, onStep }: PonsPackProps) => {
  const panel = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  const [stage, setStage] = useState<Stage>("buy");
  const [stake, setStake] = useState<number>(PRESETS[1]);
  const [typed, setTyped] = useState("");
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [settled, setSettled] = useState<"kept" | "sold" | null>(null);
  // On-chain state. Untouched while `isLive` is false, which is what keeps the
  // browser roll working unchanged until a contract exists to talk to.
  const [chainPulls, setChainPulls] = useState<ChainPull[] | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  /** The pack being waited on, so its ETH can be taken back if it never opens. */
  const [waitingPack, setWaitingPack] = useState<{
    id: bigint;
    boughtAt: number;
  } | null>(null);
  const [refundReady, setRefundReady] = useState(false);
  const [payIn, setPayIn] = useState<"eth" | "token">("eth");
  const [sale, setSale] = useState<TokenSaleState | null>(null);
  const [tokenPrice, setTokenPrice] = useState<bigint | null>(null);
  /** The film has finished but the chain has not answered yet. */
  const [filmDone, setFilmDone] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  /** ETH actually received by a real sale, once one has settled. */
  const [soldWei, setSoldWei] = useState<bigint | null>(null);
  const [selling, setSelling] = useState(false);
  const address = useWallet((state) => state.address);
  const chainId = useWallet((state) => state.chainId);
  const ready = isLive && !!address && onRightChain(chainId);

  /**
   * The caps, read from the contract rather than trusted from this file.
   *
   * They exist in both places - `lib/packs/pons.ts` for the browser roll and
   * `ShellrPacks` for the chain - and the contract is the one that decides
   * whether a purchase goes through. Reading them means raising the ceiling is
   * one owner transaction, not a transaction and a redeploy of the site.
   */
  const [limits, setLimits] = useState({
    min: MIN_STAKE,
    max: MAX_STAKE,
    paused: false,
  });

  useEffect(() => {
    if (!isLive || !open) return;
    void readTokenSale()
      .then(setSale)
      .catch(() => setSale(null));
  }, [open]);

  useEffect(() => {
    if (!isLive || !open) return;
    void readPackConfig()
      .then((config) =>
        setLimits({
          min: Number(config.minStake) / 1e18,
          max: Number(config.maxStake) / 1e18,
          paused: config.paused,
        }),
      )
      .catch(() => {
        /* keep the built-in numbers; the sheet still works read-only */
      });
  }, [open]);

  useEffect(() => setMounted(true), []);

  // Every open starts clean — the sheet is mounted once and reused.
  useEffect(() => {
    if (!open) return;
    setStage("buy");
    setPulls([]);
    setSettled(null);
  }, [open]);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!open) return;
    const key = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", key);
    // The room behind is scroll-driven; letting it move under the sheet turns
    // the page into a different act while the reveal is still up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    panel.current?.focus();
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = previous;
    };
  }, [open, close]);

  const { fee, total } = useMemo(() => stakeCost(stake), [stake]);

  // Quoted by the contract for the exact stake on screen, so the number shown
  // and the number charged come from the same place.
  useEffect(() => {
    if (!isLive || !open || payIn !== "token") return;
    void readTokenCost(BigInt(Math.round(total * 1e18)))
      .then(setTokenPrice)
      .catch(() => setTokenPrice(null));
  }, [open, payIn, total]);

  // One list for the reveal, whichever way the pack was opened. The chain's
  // rows carry real token amounts and the ETH actually spent on each; the
  // browser's carry the demo's own numbers.
  const rows = chainPulls
    ? chainPulls.map((pull) => ({
        ticker: pull.ticker,
        name: pull.name,
        rarity: pull.rarity,
        art: "",
        units: 1,
        valueEth: Number(pull.spentWei) / 1e18,
        amount: pull.amount,
      }))
    : pulls.map((pull) => ({ ...pull, amount: null as bigint | null }));

  const value = chainPulls
    ? chainPulls.reduce((sum, pull) => sum + Number(pull.spentWei) / 1e18, 0)
    : totalEth(pulls);

  const pick = (amount: number): void => {
    setStake(amount);
    setTyped("");
  };

  const type = (raw: string): void => {
    setTyped(raw);
    const parsed = Number.parseFloat(raw);
    if (Number.isFinite(parsed) && parsed > 0) {
      setStake(Math.min(Math.max(parsed, limits.min), limits.max));
    }
  };

  // What the buyer typed, against what the pack will actually take. Clamping
  // in silence is how a sheet ends up quoting one number and charging another.
  const typedValue = Number.parseFloat(typed);
  const overCap = Number.isFinite(typedValue) && typedValue > limits.max;
  const underFloor =
    Number.isFinite(typedValue) && typedValue > 0 && typedValue < limits.min;

  // The roll is instant; opening a pack should not be. The film sets the
  // length, and the guard is what stops the three ways it can end - the cut
  // point, the clip finishing, a click - from opening the pack three times.
  const opened = useRef(false);

  const finishOpening = useCallback((): void => {
    if (opened.current) return;
    opened.current = true;
    setFilmDone(true);
    // Live, the pack is already open and its coins are in state; the browser
    // roll is only for the demonstration.
    if (!isLive) setPulls(openPonsPack(stake));
    setStage("reveal");
  }, [stake]);

  // A clip can fail without saying so - autoplay refused, a decode stall, a
  // file that does not arrive. None of those fire `ended`, so the film is also
  // on a clock; it only ever marks the film done, never the pack.
  useEffect(() => {
    if (stage !== "opening") return;
    const timer = window.setTimeout(finishOpening, 9000);
    return () => window.clearTimeout(timer);
  }, [stage, finishOpening]);

  useEffect(() => {
    if (!waitingPack || stage !== "paying") {
      setRefundReady(false);
      return;
    }
    const left = waitingPack.boughtAt + 10 * 60 * 1000 - Date.now();
    if (left <= 0) {
      setRefundReady(true);
      return;
    }
    const timer = window.setTimeout(() => setRefundReady(true), left);
    return () => window.clearTimeout(timer);
  }, [waitingPack, stage]);

  const takeItBack = async (): Promise<void> => {
    if (!waitingPack) return;
    try {
      await refundPack(waitingPack.id);
      setChainError(null);
      setWaitingPack(null);
      setStage("buy");
    } catch (error) {
      console.error(error);
      setChainError(friendlyError(error));
    }
  };

  const buy = (): void => {
    opened.current = false;
    setFilmDone(false);
    setChainError(null);
    setChainPulls(null);
    setTxHash(null);

    // Without a contract this is a demonstration and the roll is local.
    if (!isLive) {
      setStage("opening");
      return;
    }
    // With one, there is no local roll to fall back to. No wallet, no pack.
    if (!ready) {
      setChainError("Connect a wallet on Robinhood Chain to open a pack.");
      return;
    }

    setStage("paying");
    void (async () => {
      try {
        const stakeWei = BigInt(Math.round(total * 1e18));
        const pack =
          payIn === "token"
            ? await buyPackWithToken(stakeWei)
            : await buyPack(stakeWei);
        setTxHash(pack.hash);
        setWaitingPack({ id: pack.packId, boughtAt: Date.now() });
        // Straight to the film. The reveal is fetched underneath it, and if the
        // clip finishes first it holds and says so - see `settling` below.
        setStage("opening");
        const delivered = await waitForReveal(pack);
        setChainPulls(delivered);
      } catch (error) {
        console.error(error);
        setChainError(friendlyError(error));
        setStage("buy");
      }
    })();
  };

  const keep = (): void => {
    keepPulls(pulls);
    setSettled("kept");
    setPulls([]);
    setChainPulls(null);
    opened.current = false;
    setStage("buy");
  };

  const sell = (): void => {
    // The demo settles instantly against its own numbers. A real sale is one
    // swap per coin, each quoted first - so it reports what the wallet got,
    // not what the sheet estimated.
    if (!chainPulls || !ready) {
      sellPulls(pulls);
      setSoldWei(null);
      setSettled("sold");
      setStage("done");
      return;
    }

    setSelling(true);
    setChainError(null);
    void (async () => {
      try {
        const fees = await readPoolFees();
        let received = 0n;
        for (const pull of chainPulls) {
          const poolFee = fees.get(pull.address.toLowerCase());
          if (!poolFee) continue;
          const { out, minOut } = await quoteSell(
            pull.address,
            poolFee,
            pull.amount,
          );
          await sellBack(pull.address, poolFee, pull.amount, minOut);
          received +=
            (out * BigInt(10000 - Math.round(SELL_FEE * 10000))) / 10000n;
        }
        setSoldWei(received);
        setSettled("sold");
        setStage("done");
      } catch (error) {
        console.error(error);
        setChainError(friendlyError(error));
      } finally {
        setSelling(false);
      }
    })();
  };

  /** Where the highlight sits, written straight to the element on move. */
  const light = (event: ReactPointerEvent<HTMLDivElement>): void => {
    const node = panel.current;
    if (!node) return;
    const box = node.getBoundingClientRect();
    node.style.setProperty("--lx", `${event.clientX - box.left}px`);
    node.style.setProperty("--ly", `${event.clientY - box.top}px`);
  };

  if (!mounted || !open) return null;

  const glass: CSSProperties = {
    background:
      "linear-gradient(152deg, rgba(255,255,255,0.11), rgba(255,255,255,0.03) 38%, rgba(214,216,219,0.06))",
    backdropFilter: "blur(44px) saturate(170%)",
    WebkitBackdropFilter: "blur(44px) saturate(170%)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.34), inset 0 -1px 0 rgba(255,255,255,0.07), inset 0 0 60px rgba(214,216,219,0.05), 0 40px 120px rgba(0,0,0,0.75)",
  };

  const field =
    "rounded-xl border border-white/12 bg-white/[0.04] px-3 py-2.5 text-[0.875rem] transition-colors duration-[var(--duration-fast)] ease-entrance";
  const button =
    "paint-over rounded-xl px-5 py-3 text-[0.9375rem] font-semibold transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-85 disabled:opacity-40";

  // Paying. The wallet is up, or the block is being waited for - and nothing
  // is played until it lands, because a film over an unconfirmed payment
  // implies a pack that has not been bought.
  if (stage === "paying") {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Buying a pack"
        className="pons-fade fixed inset-0 z-[70] flex flex-col items-center justify-center gap-4 bg-black/88 font-sans text-nav-text backdrop-blur-lg"
      >
        <span className="font-display flex items-end gap-1 text-[2rem] font-semibold text-nav-accent">
          {txHash ? "Opening the pack" : "Confirm in your wallet"}
          {txHash && (
            <span className="flex gap-1 pb-2" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span
                  key={i}
                  className="pons-dot size-1.5 rounded-full bg-nav-accent"
                  style={{ animationDelay: `${i * 0.18}s` }}
                />
              ))}
            </span>
          )}
        </span>
        <span className="max-w-[24rem] text-center text-[0.8125rem] leading-[1.6] text-nav-text/50">
          {txHash ? "Waiting for the block." : `${eth(total)}, fee included.`}
        </span>
        {/* The clip is fetched while the chain is being waited on, not when it
            is put on screen. It is a third of a megabyte, and starting that
            download at the moment of the cut is a second of black - the wait
            is already paid for, so spend it. */}
        <video
          src={PONS_PACK_VIDEO}
          preload="auto"
          muted
          playsInline
          aria-hidden="true"
          className="pointer-events-none absolute h-px w-px opacity-0"
        />

        {txHash && (
          <a
            href={explorerTx(txHash)}
            target="_blank"
            rel="noreferrer"
            className="text-[0.6875rem] text-nav-text/40 underline-offset-4 hover:underline"
          >
            View the transaction
          </a>
        )}

        {/* The contract's own backstop, surfaced. Ten minutes after a purchase
            the buyer can take the whole payment back, fee included - and that
            is worth a button rather than a paragraph in the docs. */}
        {refundReady && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <p className="max-w-[26rem] text-center text-[0.75rem] leading-[1.6] text-nav-text/45">
              This pack has not been opened for ten minutes. You can take the
              payment back, fee included.
            </p>
            <button
              type="button"
              onClick={() => void takeItBack()}
              className="rounded-xl border border-white/20 px-5 py-2.5 text-[0.875rem] font-semibold transition-opacity hover:opacity-85"
            >
              Refund this pack
            </button>
          </div>
        )}

        {chainError && (
          <p className="mt-3 max-w-[26rem] text-center text-[0.75rem] leading-[1.5] break-words text-[#ff3a6e]">
            {chainError}
          </p>
        )}
      </div>,
      document.body,
    );
  }

  // While the pack is opening there is no sheet at all.
  //
  // The panel is a place to read numbers; the film is not. Drawing it inside
  // the panel left a grey box round the tear and a header above it, and the
  // pack ends up looking like a video embedded in a page rather than a pack
  // being opened. So the sheet steps out of the way and the room behind is
  // blurred - the site is still there, just out of focus.
  //
  // The clip is portrait, so it is sized by **height**: full window less the
  // HUD's inset, which puts its top and bottom edge on the same rules that
  // frame the site. What is left either side is the blurred room.
  if (stage === "opening") {
    return createPortal(
      <div
        onClick={finishOpening}
        role="dialog"
        aria-modal="true"
        aria-label="Opening the pack"
        className="pons-fade fixed inset-0 z-[70] flex cursor-pointer items-center justify-center bg-black/35 font-sans backdrop-blur-2xl"
      >
        <video
          src={PONS_PACK_VIDEO}
          autoPlay
          muted
          playsInline
          preload="auto"
          onTimeUpdate={(event) => {
            if (event.currentTarget.currentTime >= REVEAL_AT) finishOpening();
          }}
          onEnded={finishOpening}
          onError={finishOpening}
          className="h-dvh w-auto max-w-none"
        />
        <div className="pointer-events-none absolute inset-x-0 bottom-10 flex flex-col items-center gap-1.5 sm:bottom-14">
          <span className="text-[0.8125rem] text-white/45">
            Tap to see what dropped
          </span>
          {ready && txHash && (
            <a
              href={explorerTx(txHash)}
              target="_blank"
              rel="noreferrer"
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
      role="dialog"
      aria-modal="true"
      aria-label="Pons Pack"
      className="pons-fade fixed inset-0 z-[70] overflow-y-auto bg-black/88 font-sans text-nav-text backdrop-blur-lg"
    >
      {/* The scroller and the centring are two boxes on purpose: a centred
          flex box that is also the scroller cuts the *top* off anything taller
          than the window, and a hundred-coin reveal is taller than the window.
          Clicking the gap around the panel closes the sheet. */}
      <div
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="flex min-h-full items-center justify-center px-4 py-8 sm:px-16"
      >
        <div
          ref={panel}
          tabIndex={-1}
          onPointerMove={light}
          style={glass}
          className="pons-rise paint-under relative w-full max-w-[46rem] rounded-[1.75rem] border border-white/14 p-6 outline-none sm:p-9"
        >
          {/* The light. Sits under the content and over the glass, so the panel
            has a source rather than a baked gradient. */}
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-0 rounded-[1.75rem] opacity-70"
            style={{
              background:
                "radial-gradient(20rem 20rem at var(--lx, 30%) var(--ly, 0%), rgba(214,216,219,0.13), transparent 70%)",
            }}
          />

          <button
            type="button"
            onClick={close}
            aria-label="Close"
            className="absolute top-5 right-5 z-10 grid size-8 place-items-center rounded-full border border-white/14 bg-white/5 text-[1rem] leading-none text-nav-text/70 transition-colors hover:bg-white/12 hover:text-nav-text"
          >
            ×
          </button>

          {/* Straight to the next pack, without closing the sheet
                      and finding the ring again. One list, both sheets - see
                      `lib/packs/sheet.ts`. */}
          {onStep && (
            <div className="pointer-events-none absolute inset-y-0 -left-14 -right-14 z-20 hidden items-center justify-between sm:flex">
              <button
                type="button"
                onClick={() => onStep(-1)}
                aria-label="Previous pack"
                className={STEP}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M15 5 8 12l7 7" />
                </svg>
              </button>
              <button
                type="button"
                onClick={() => onStep(1)}
                aria-label="Next pack"
                className={STEP}
              >
                <svg
                  viewBox="0 0 24 24"
                  aria-hidden="true"
                  className="size-5"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.75"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="m9 5 7 7-7 7" />
                </svg>
              </button>
            </div>
          )}

          <div className="relative z-10">
            {stage === "buy" && (
              <>
                <p className="text-[0.6875rem] tracking-[0.28em] text-nav-accent/80 uppercase">
                  Pons launchpad
                </p>
                <h2 className="font-display mt-1 text-[2.75rem] leading-[var(--leading-display)] font-semibold text-nav-accent uppercase">
                  Pons Pack
                </h2>
                <p className="mt-2 max-w-[34rem] text-[0.875rem] leading-[1.5] text-nav-text/60">
                  Every meme in here launched on Pons. Name your stake, tear the
                  pack open, then keep what drops or sell it back on the spot.
                </p>

                <div className="mt-7 grid gap-7 sm:min-h-[27rem] sm:grid-cols-[17rem_1fr] sm:items-start sm:gap-8">
                  <div className="flex justify-center sm:justify-start">
                    <Image
                      src={PONS_PACK_ART}
                      alt="Pons Pack"
                      width={760}
                      height={1100}
                      className="w-full max-w-[18rem]"
                      priority
                    />
                  </div>

                  <div>
                    {/* Two ways to pay. The token half only appears when the
                        contract says it is switched on, and it says what the
                        discount is rather than hard-coding a number that would
                        go stale the first time the owner changes it. */}
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setPayIn("eth")}
                        className={`flex-1 rounded-xl px-3 py-2.5 text-center text-[0.875rem] font-semibold transition-colors ${
                          payIn === "eth"
                            ? "bg-nav-accent text-nav-accent-ink"
                            : "bg-white/[0.04] text-nav-text/55"
                        }`}
                      >
                        Pay in ETH
                      </button>
                      {sale?.enabled ? (
                        <button
                          type="button"
                          onClick={() => setPayIn("token")}
                          className={`flex flex-1 flex-col items-center justify-center gap-0.5 rounded-xl px-3 py-2 transition-colors ${
                            payIn === "token"
                              ? "bg-nav-accent text-nav-accent-ink"
                              : "bg-white/[0.04] text-nav-text/55"
                          }`}
                        >
                          <span className="text-[0.875rem] leading-none whitespace-nowrap">
                            Pay in $SHELLR
                          </span>
                          <span className="text-[0.5625rem] leading-none tracking-[0.14em] uppercase opacity-70">
                            {sale.discountBps / 100}% off
                          </span>
                        </button>
                      ) : (
                        <span
                          aria-disabled="true"
                          className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.04] px-3 py-2 text-center"
                        >
                          <span className="text-[0.875rem] leading-none whitespace-nowrap text-nav-text/55">
                            Pay in $SHELLR
                          </span>
                          <span className="text-[0.5625rem] leading-none tracking-[0.14em] text-nav-text/35 uppercase">
                            Not accepted yet
                          </span>
                        </span>
                      )}
                    </div>

                    <input
                      inputMode="decimal"
                      value={typed}
                      onChange={(event) => type(event.target.value)}
                      placeholder={`Custom amount (${limits.min}-${limits.max} ETH)`}
                      className={`${field} mt-2 w-full text-nav-text placeholder:text-nav-text/35 focus:border-nav-accent/60`}
                    />
                    {(overCap || underFloor) && (
                      <p className="mt-2 text-[0.75rem] leading-[1.5] text-nav-accent/80">
                        {overCap
                          ? `A pack is capped at ${limits.max} ETH while the contract is unaudited - your stake was set to the cap.`
                          : `The smallest pack is ${limits.min} ETH - your stake was set to the floor.`}
                      </p>
                    )}
                    {limits.paused && (
                      <p className="mt-2 text-[0.75rem] leading-[1.5] text-[#ff3a6e]">
                        Sales are paused right now. Packs already bought still
                        settle, and refunds still work.
                      </p>
                    )}

                    <p className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-[0.8125rem] leading-[1.6] text-nav-text/60">
                      Sealed until you open it. The draw is settled at the
                      moment the pack is opened, not when you pay for it -
                      published odds, no pity counter, and no way to see inside
                      first.
                    </p>

                    <dl className="mt-4 flex flex-col gap-1.5 text-[0.8125rem]">
                      <div className="flex justify-between">
                        <dt className="text-nav-text/50">
                          Shellr fee ({Math.round(FEE_RATE * 100)}%)
                        </dt>
                        <dd>{eth(fee)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-nav-text/50">Spent on coins</dt>
                        <dd>{eth(total - fee)}</dd>
                      </div>
                      <div className="mt-1 flex justify-between border-t border-white/10 pt-2 text-[0.9375rem] font-semibold">
                        <dt>You pay</dt>
                        <dd>
                          {payIn === "token"
                            ? tokenPrice === null
                              ? "…"
                              : `${Number(
                                  formatUnits(tokenPrice, 18),
                                ).toLocaleString("en-US", {
                                  maximumFractionDigits: 0,
                                })} $SHELLR`
                            : eth(total)}
                        </dd>
                      </div>
                    </dl>

                    <WalletButton className="mt-5" />
                    {(!isLive || ready) && (
                      <button
                        type="button"
                        onClick={buy}
                        className={`${button} mt-5 w-full bg-nav-accent text-nav-accent-ink`}
                      >
                        Open pack
                      </button>
                    )}
                    {chainError && (
                      <p className="mt-3 max-w-full text-[0.8125rem] leading-[1.5] break-words text-[#ff3a6e]">
                        {chainError}
                      </p>
                    )}
                    {!isLive && (
                      <p className="mt-3 text-center text-[0.6875rem] leading-[1.5] text-nav-text/35">
                        Demonstration - the draw runs in this browser and no ETH
                        is spent.
                      </p>
                    )}
                    {isLive && ready && (
                      <p className="mt-3 text-center text-[0.6875rem] leading-[1.5] text-nav-text/35">
                        Coins are delivered by the swap, straight to your
                        wallet.
                      </p>
                    )}
                  </div>
                </div>
              </>
            )}

            {(stage === "reveal" || stage === "done") && (
              <>
                {/* The coins are still being fetched. The sheet opens anyway
                    and says so, because the alternative - holding the film on
                    its last frame - reads as a crash, and showing a pack worth
                    zero reads as a loss that did not happen. */}
                {isLive && !chainPulls ? (
                  <div className="flex min-h-[14rem] flex-col items-center justify-center gap-3">
                    <span className="font-display flex items-end gap-1 text-[1.75rem] font-semibold text-nav-accent">
                      Settling on-chain
                      <span className="flex gap-1 pb-2" aria-hidden="true">
                        {[0, 1, 2].map((i) => (
                          <span
                            key={i}
                            className="pons-dot size-1.5 rounded-full bg-nav-accent"
                            style={{ animationDelay: `${i * 0.18}s` }}
                          />
                        ))}
                      </span>
                    </span>
                    <span className="max-w-[24rem] text-center text-[0.8125rem] leading-[1.6] text-nav-text/45">
                      The pack is paid for and the draw is committed. The coins
                      appear here the moment the swap lands.
                    </span>
                    {chainError && (
                      <span className="max-w-[26rem] text-center text-[0.8125rem] leading-[1.5] break-words text-[#ff3a6e]">
                        {chainError}
                      </span>
                    )}
                  </div>
                ) : (
                  <>
                    {/* The mark leads the reveal. This is the one screen a buyer
                    screenshots, and it should carry whose pack it was. */}
                    <div className="flex items-center gap-3">
                      <Image
                        src="/assets/brand/shellr-mark-v93.png"
                        alt=""
                        width={704}
                        height={768}
                        className="w-[2rem] [image-rendering:pixelated]"
                        priority
                      />
                      <span className="text-[0.6875rem] tracking-[0.28em] text-nav-accent/70 uppercase">
                        Pons Pack
                      </span>
                    </div>
                    <p className="mt-6 text-[0.75rem] font-semibold tracking-[0.08em] text-nav-accent uppercase">
                      {stage === "done"
                        ? settled === "kept"
                          ? "Sent to your vault"
                          : "Sold"
                        : "You pulled"}
                    </p>
                    <h2 className="mt-2 font-display text-[2.5rem] leading-[var(--leading-display)] font-semibold">
                      {eth(value)}
                    </h2>
                    <p className="mt-1 text-[0.8125rem] text-nav-text/50">
                      {rows.length} {rows.length === 1 ? "coin" : "coins"} ·
                      paid {eth(total)} ·{" "}
                      <span
                        className="font-semibold"
                        style={{ color: value >= total ? UP : DOWN }}
                      >
                        {pnl(value, total)}
                      </span>
                    </p>

                    <ul className="mt-6 flex flex-col gap-2">
                      {rows.map((pull) => (
                        <li
                          key={pull.ticker}
                          className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-2.5"
                        >
                          <Image
                            src={AVATAR.get(pull.ticker) ?? pull.art}
                            alt=""
                            width={160}
                            height={160}
                            className="size-[3rem] shrink-0 rounded-full object-cover"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[0.9375rem] font-semibold">
                              ${pull.ticker}
                            </span>
                            <span
                              className="block text-[0.6875rem] tracking-[0.14em] uppercase"
                              style={{ color: BAND[pull.rarity] }}
                            >
                              {pull.rarity}
                            </span>
                          </span>
                          <span className="text-right">
                            <span className="block text-[0.9375rem] font-semibold whitespace-nowrap">
                              {pull.amount === null
                                ? coinAmount(pull.ticker, pull.valueEth)
                                : Number(
                                    formatUnits(pull.amount, 18),
                                  ).toLocaleString("en-US", {
                                    maximumFractionDigits: 2,
                                  })}
                            </span>
                            <span className="block text-[0.75rem] text-nav-text/45">
                              {eth(pull.valueEth)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>

                    {stage === "reveal" ? (
                      <div className="mt-7 flex flex-wrap gap-3">
                        <button
                          type="button"
                          onClick={keep}
                          className={`${button} bg-nav-accent text-nav-accent-ink`}
                        >
                          Open another
                        </button>
                        <button
                          type="button"
                          onClick={sell}
                          disabled={selling}
                          className={`${button} border border-white/14`}
                        >
                          {selling
                            ? "Selling…"
                            : `Sell for ${eth(netOfFee(value))}`}
                        </button>
                        <p className="w-full text-[0.75rem] text-nav-text/40">
                          Selling back swaps at market and takes{" "}
                          {Math.round(SELL_FEE * 100)}% -{" "}
                          {eth(value * SELL_FEE)} of {eth(value)}.
                        </p>
                      </div>
                    ) : (
                      <>
                        {/* The sale says so, with the figure. Buttons that simply
                        disappear read as the sheet losing its place. */}
                        <div className="mt-7 rounded-2xl border border-nav-accent/25 bg-nav-accent/[0.07] px-5 py-4">
                          <p
                            className="text-[0.9375rem] font-semibold"
                            style={{
                              color: settled === "sold" ? UP : undefined,
                            }}
                          >
                            +
                            {eth(
                              soldWei !== null
                                ? Number(soldWei) / 1e18
                                : netOfFee(value),
                            )}{" "}
                            back in your wallet.
                          </p>
                          <p className="mt-1 text-[0.8125rem] leading-[1.6] text-nav-text/50">
                            {eth(value)} at market, less the{" "}
                            {Math.round(SELL_FEE * 100)}% fee.
                          </p>
                        </div>

                        <div className="mt-5 flex flex-wrap gap-3">
                          <Link
                            href="/inventory"
                            className={`${button} bg-nav-accent text-nav-accent-ink`}
                          >
                            Open inventory
                          </Link>
                          <button
                            type="button"
                            onClick={() => setStage("buy")}
                            className={`${button} border border-white/14`}
                          >
                            Open another
                          </button>
                        </div>
                      </>
                    )}
                  </>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
};
