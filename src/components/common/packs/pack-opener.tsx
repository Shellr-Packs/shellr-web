"use client";

import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { formatUnits } from "viem";

import {
  eth,
  openPack,
  tierByName,
  totalEth,
  type Pull,
} from "@/lib/packs/pool";
import { AVATAR, DOWN, UP, coinAmount, pnl } from "@/lib/packs/format";
import { WalletButton } from "@/components/common/chain/wallet-button";
import { explorerTx, isLive } from "@/lib/chain/config";
import {
  buyPack,
  friendlyError,
  refundPack,
  readPackConfig,
  waitForReveal,
  type ChainPull,
} from "@/lib/chain/packs";
import { onRightChain, useWallet } from "@/lib/chain/wallet";
import { SELL_FEE, keepPulls, netOfFee, sellPulls } from "@/lib/packs/vault";

export interface PackOpenerProps {
  /** Walk to the next pack in the ring: `1` forward, `-1` back. */
  onStep?: (delta: number) => void;
  /** The tier picked in the carousel, or `null` while the overlay is shut. */
  tier: string | null;
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
/**
 * Fallback cut point, in seconds, for a clip that carries no `revealAt`.
 *
 * Each tier's real number lives beside its clip in `lib/packs/pool.ts` — the
 * five are not choreographed alike. `onEnded` catches any clip whose number is
 * set too late, so a wrong one costs a pause, never a stuck pack.
 */
const REVEAL_FALLBACK = 4.2;

const BAND: Record<string, string> = {
  MYTHIC: "#ff3a6e",
  LEGENDARY: "#f5c420",
  EPIC: "#a6e62c",
  RARE: "#b0bec5",
  COMMON: "#78848c",
};

type Stage = "buy" | "paying" | "opening" | "reveal" | "done";

/**
 * The pack theatre.
 *
 * Four states rather than one screen with flags, because each is a different
 * question: what am I buying, wait, here is what you pulled, what do you want
 * done with it. `stage` is the whole of it.
 *
 * The roll happens in the browser — see `lib/packs/pool.ts` for why that is a
 * placeholder and not the finished thing.
 */
export const PackOpener = ({ tier, onClose, onStep }: PackOpenerProps) => {
  const [stage, setStage] = useState<Stage>("buy");
  const [mounted, setMounted] = useState(false);
  const [pulls, setPulls] = useState<Pull[]>([]);
  const [chainPulls, setChainPulls] = useState<ChainPull[] | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  /** The pack being waited on, so its ETH can be taken back if it never opens. */
  const [waitingPack, setWaitingPack] = useState<{
    id: bigint;
    boughtAt: number;
  } | null>(null);
  const [refundReady, setRefundReady] = useState(false);
  /** The film has finished but the chain has not answered yet. */
  const [filmDone, setFilmDone] = useState(false);
  const [chainError, setChainError] = useState<string | null>(null);
  const address = useWallet((state) => state.address);
  const chainId = useWallet((state) => state.chainId);
  const ready = isLive && !!address && onRightChain(chainId);

  /**
   * The contract's ceiling, read rather than assumed.
   *
   * A tier is a fixed stake, and the ceiling is set by how much bankroll there
   * is to cover a win. Lower the ceiling and the dearest tiers stop being
   * buyable - so the sheet has to know, or it sells a pack the contract will
   * refuse and the buyer pays gas to find out.
   */
  const [ceiling, setCeiling] = useState<number | null>(null);
  useEffect(() => {
    if (!isLive || !tier) return;
    void readPackConfig()
      .then((config) => setCeiling(Number(config.maxStake) / 1e18))
      .catch(() => setCeiling(null));
  }, [tier]);
  const [settled, setSettled] = useState<"kept" | "sold" | null>(null);

  // Every open starts clean: the overlay is mounted once and reused, so without
  // this the second pack opens straight onto the first one's reveal.
  useEffect(() => {
    if (tier) {
      setStage("buy");
      setPulls([]);
      setSettled(null);
    }
  }, [tier]);

  useEffect(() => setMounted(true), []);

  const close = useCallback(() => onClose(), [onClose]);

  useEffect(() => {
    if (!tier) return;
    const key = (event: KeyboardEvent): void => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", key);
    // The room behind is scroll-driven; letting it move under an overlay turns
    // the page into a different act while the reveal is still up.
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = previous;
    };
  }, [tier, close]);

  // The roll is instant; opening a pack should not be. Where there is film of
  // the tear it sets the length; where there is not, a beat stands in.
  //
  // Above the early return because it is a hook: `tier` decides whether this
  // component renders anything, not whether it runs its hooks.
  const opened = useRef(false);

  const finishOpening = useCallback((): void => {
    if (opened.current || !tier) return;
    opened.current = true;
    if (!isLive) setPulls(openPack(tierByName(tier)));
    setStage("reveal");
  }, [tier]);

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

  if (!tier || !mounted) return null;

  const spec = tierByName(tier);
  // One list either way: the chain's rows carry real token amounts and the ETH
  // actually spent per coin; the browser's carry the demonstration's numbers.
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

  const overCeiling = ceiling !== null && spec.priceEth > ceiling;

  const buy = (): void => {
    if (overCeiling) return;
    opened.current = false;
    setFilmDone(false);
    setChainError(null);
    setChainPulls(null);
    setTxHash(null);

    if (!isLive) {
      setStage("opening");
      if (!spec.video) window.setTimeout(finishOpening, 1100);
      return;
    }
    if (!ready) {
      setChainError("Connect a wallet on Robinhood Chain to open a pack.");
      return;
    }

    // A tier is a fixed stake, so it buys through the same call as the Pons
    // sheet - one contract, one draw, whichever door the pack came from.
    setStage("paying");
    void (async () => {
      try {
        const pack = await buyPack(BigInt(Math.round(spec.priceEth * 1e18)));
        setTxHash(pack.hash);
        setWaitingPack({ id: pack.packId, boughtAt: Date.now() });
        // Straight to the film - see the note in `pons-pack.tsx`.
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
    opened.current = false;
    setStage("buy");
  };

  const sell = (): void => {
    sellPulls(pulls);
    setSettled("sold");
    setStage("done");
  };

  const button =
    "paint-over rounded-xl px-5 py-3 text-[0.9375rem] font-semibold transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-85";

  // The same glass the Pons Pack sheet is built from.
  const glass = {
    background:
      "linear-gradient(152deg, rgba(255,255,255,0.11), rgba(255,255,255,0.03) 38%, rgba(214,216,219,0.06))",
    backdropFilter: "blur(44px) saturate(170%)",
    WebkitBackdropFilter: "blur(44px) saturate(170%)",
    boxShadow:
      "inset 0 1px 0 rgba(255,255,255,0.34), inset 0 -1px 0 rgba(255,255,255,0.07), 0 40px 120px rgba(0,0,0,0.75)",
  };

  // Portalled to `body`, like the Pons sheet.
  //
  // It used to render where it sits in the tree, inside the scene - and the
  // hero's column is a later sibling with a stacking context of its own, so the
  // headline and the buttons under it painted straight over the panel whatever
  // z-index it was given. A portal takes the sheet out of that argument
  // entirely; there is nothing above `body`.
  // Paying, before anything is played - see the note in `pons-pack.tsx`.
  if (stage === "paying") {
    return createPortal(
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`Buying ${spec.name}`}
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
          {txHash
            ? "Waiting for the block."
            : `${eth(spec.priceEth)} for ${spec.name}.`}
        </span>
        {/* The clip is fetched while the chain is being waited on, not when it
            is put on screen. It is a third of a megabyte, and starting that
            download at the moment of the cut is a second of black - the wait
            is already paid for, so spend it. */}
        <video
          src={spec.video}
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

  // The tear takes the whole window - see the note in `pons-pack.tsx`. A tier
  // with no clip keeps the sheet and the plain wait.
  if (stage === "opening" && spec.video) {
    return createPortal(
      <div
        onClick={finishOpening}
        role="dialog"
        aria-modal="true"
        aria-label={`Opening ${spec.name}`}
        className="pons-fade fixed inset-0 z-[70] flex cursor-pointer items-center justify-center bg-black/35 font-sans backdrop-blur-2xl"
      >
        <video
          src={spec.video}
          autoPlay
          muted
          playsInline
          preload="auto"
          onTimeUpdate={(event) => {
            const cut = spec.revealAt ?? REVEAL_FALLBACK;
            if (event.currentTarget.currentTime >= cut) finishOpening();
          }}
          onEnded={finishOpening}
          onError={finishOpening}
          className="h-dvh w-auto max-w-none"
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-10 flex justify-center text-[0.8125rem] text-white/45 sm:bottom-14">
          Tap to see what dropped
        </span>
      </div>,
      document.body,
    );
  }

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Open ${spec.name}`}
      className="pons-fade fixed inset-0 z-[70] overflow-y-auto bg-black/88 font-sans text-nav-text backdrop-blur-lg"
    >
      {/* Scroller and centring are two boxes: a centred flex box that is also
          the scroller cuts the top off a tall reveal. */}
      <div
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) close();
        }}
        className="flex min-h-full items-center justify-center px-4 py-8 sm:px-16"
      >
        <div
          style={glass}
          className="pons-rise paint-under relative w-full max-w-[46rem] rounded-[1.75rem] border border-white/14 p-6 sm:p-9"
        >
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
                  Sealed pack
                </p>
                <h2 className="mt-1 font-display text-[2.75rem] leading-[var(--leading-display)] font-semibold text-nav-accent uppercase">
                  {spec.name}
                </h2>
                <p className="mt-2 max-w-[34rem] text-[0.875rem] leading-[1.5] text-nav-text/60">
                  Sealed. What is inside was decided before you got here, and a
                  pack can be worth less than it cost.
                </p>

                <div className="mt-7 grid gap-7 sm:min-h-[27rem] sm:grid-cols-[17rem_1fr] sm:items-start sm:gap-8">
                  {/* The photographed pack. Its price and coin range are
                      printed on the foil, which is why `priceEth` and `draws`
                      in `lib/packs/pool.ts` cannot move without new art. */}
                  <div className="flex justify-center sm:justify-start">
                    <Image
                      src={spec.art}
                      alt={spec.name}
                      width={760}
                      height={1100}
                      className="w-full max-w-[18rem]"
                      priority
                    />
                  </div>

                  <div>
                    {/* One control, two halves — a segmented switch rather than
                        two loose boxes. Equal columns keep the labels on one
                        line whatever they say. */}
                    <div className="grid grid-cols-2 gap-1 rounded-2xl border border-white/10 bg-black/30 p-1">
                      <span className="rounded-xl bg-nav-accent px-3 py-2.5 text-center text-[0.875rem] leading-none font-semibold text-nav-accent-ink">
                        Pay in ETH
                      </span>
                      {/* Unbuilt, and it has to read as unbuilt without becoming
                          unreadable. Dimming the label to nothing did both at
                          once — so the half keeps a legible label and says why
                          on its own line instead. */}
                      <span
                        aria-disabled="true"
                        className="flex flex-col items-center justify-center gap-1 rounded-xl bg-white/[0.04] px-3 py-2 text-center"
                      >
                        <span className="text-[0.875rem] leading-none whitespace-nowrap text-nav-text/55">
                          Pay in $SHELLR
                        </span>
                        <span className="text-[0.5625rem] leading-none tracking-[0.14em] text-nav-text/35 uppercase">
                          Not live yet
                        </span>
                      </span>
                    </div>

                    <p className="mt-4 rounded-2xl border border-white/10 bg-black/25 p-4 text-[0.8125rem] leading-[1.6] text-nav-text/60">
                      {spec.floor
                        ? `Guaranteed at least one ${spec.floor.toLowerCase()}. `
                        : "No floor on this one. "}
                      How much of your stake the pack spends is drawn too, from
                      a published table - most land near even, a few well under,
                      a few over. Settled when the pack opens, not when you pay
                      for it.
                    </p>

                    {/* The fee comes out of the price rather than on top of it,
                        the way the contract takes it - see /docs/fees. */}
                    <dl className="mt-4 flex flex-col gap-1.5 text-[0.8125rem]">
                      <div className="flex justify-between">
                        <dt className="text-nav-text/50">Shellr fee (2%)</dt>
                        <dd>{eth(spec.priceEth * 0.02)}</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt className="text-nav-text/50">Spent on coins</dt>
                        <dd>{eth(spec.priceEth * 0.98)}</dd>
                      </div>
                      <div className="mt-1 flex justify-between border-t border-white/10 pt-2 text-[0.9375rem] font-semibold">
                        <dt>You pay</dt>
                        <dd>{eth(spec.priceEth)}</dd>
                      </div>
                    </dl>

                    <WalletButton className="mt-5" />
                    {(!isLive || ready) &&
                      (overCeiling ? (
                        // Above what the contract will take. Saying so beats
                        // letting the buyer pay gas to be told.
                        <p className="mt-5 rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-center text-[0.8125rem] leading-[1.5] text-nav-text/50">
                          This tier is above the current ceiling of {ceiling}{" "}
                          ETH. The smaller packs are open.
                        </p>
                      ) : (
                        <button
                          type="button"
                          onClick={buy}
                          className={`${button} mt-5 w-full bg-nav-accent text-nav-accent-ink`}
                        >
                          Open pack
                        </button>
                      ))}
                    {chainError && (
                      <p className="mt-3 max-w-full text-[0.8125rem] leading-[1.5] break-words text-[#ff3a6e]">
                        {chainError}
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
                        {spec.name}
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
                      paid {eth(spec.priceEth)} ·{" "}
                      <span
                        className="font-semibold"
                        style={{
                          color: value >= spec.priceEth ? UP : DOWN,
                        }}
                      >
                        {pnl(value, spec.priceEth)}
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
                              className="block text-[0.75rem] font-semibold"
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
                            <span className="block text-[0.75rem] text-nav-text/50">
                              {eth(pull.valueEth)}
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>

                    {stage === "reveal" ? (
                      <>
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
                            className={`${button} border border-white/14`}
                          >
                            Sell for {eth(netOfFee(value))}
                          </button>
                        </div>
                        <p className="mt-2 text-[0.75rem] text-nav-text/40">
                          Selling back swaps at market and takes{" "}
                          {Math.round(SELL_FEE * 100)}% -{" "}
                          {eth(value * SELL_FEE)} of {eth(value)}.
                        </p>
                      </>
                    ) : (
                      <>
                        {/* Settled. The buttons used to just vanish, which reads as
                        the sheet losing its place rather than as the sale
                        having gone through — so it says what happened, with the
                        figure, before offering anywhere to go next. */}
                        <div className="mt-7 rounded-2xl border border-nav-accent/25 bg-nav-accent/[0.07] px-5 py-4">
                          <p
                            className="text-[0.9375rem] font-semibold"
                            style={{
                              color: settled === "sold" ? UP : undefined,
                            }}
                          >
                            +{eth(netOfFee(value))} back in your wallet.
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
                            onClick={close}
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
