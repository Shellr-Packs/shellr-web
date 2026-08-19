"use client";

import { PageNav } from "@/components/common/nav/page-nav";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { formatUnits, parseUnits } from "viem";

import { WalletButton } from "@/components/common/chain/wallet-button";
import { friendlyError } from "@/lib/chain/packs";
import {
  claimRewards,
  readStaking,
  stakeShellr,
  stakingLive,
  unstakeShellr,
  type StakingState,
} from "@/lib/chain/staking";
import { onRightChain, useWallet } from "@/lib/chain/wallet";

/**
 * `/staking` — stake $SHELLR, earn WETH.
 *
 * Deliberately without an APR. The rewards are whatever somebody funded the
 * contract with, spread over a period; turning that into a yearly percentage
 * would annualise a number that has no reason to repeat, and every visitor
 * would read it as a promise. What is shown instead is the truth: how much is
 * in the pot, over how long it pays, and what share of it this wallet has.
 */

const glass: CSSProperties = {
  background:
    "linear-gradient(152deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 38%, rgba(214,216,219,0.05))",
  backdropFilter: "blur(40px) saturate(160%)",
  WebkitBackdropFilter: "blur(40px) saturate(160%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.26), inset 0 -1px 0 rgba(255,255,255,0.05), 0 30px 90px rgba(0,0,0,0.6)",
};

const field =
  "w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[1.0625rem] text-nav-text placeholder:text-nav-text/30 transition-colors duration-[var(--duration-fast)] ease-entrance focus:border-nav-accent/60 focus:outline-none";

const token = (value: bigint, digits = 2): string =>
  Number(formatUnits(value, 18)).toLocaleString("en-US", {
    maximumFractionDigits: digits,
  });

export const StakingView = () => {
  const address = useWallet((state) => state.address);
  const chainId = useWallet((state) => state.chainId);
  const ready = stakingLive && !!address && onRightChain(chainId);

  const [state, setState] = useState<StakingState | null>(null);
  const [amount, setAmount] = useState("");
  const [mode, setMode] = useState<"stake" | "unstake">("stake");
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!stakingLive) return Promise.resolve();
    return readStaking(address ?? undefined)
      .then(setState)
      .catch(() => setState(null));
  }, [address]);

  useEffect(() => {
    void load();
    // The pot drains by the second; a page that never moves looks broken.
    const timer = window.setInterval(() => void load(), 15_000);
    return () => window.clearInterval(timer);
  }, [load]);

  const run = (label: string, work: () => Promise<unknown>) => {
    setBusy(label);
    setError(null);
    void work()
      .then(() => {
        setAmount("");
        return load();
      })
      .catch((problem) => {
        console.error(problem);
        setError(friendlyError(problem));
      })
      .finally(() => setBusy(null));
  };

  const max = mode === "stake" ? state?.walletBalance : state?.myStake;
  const parsed = (() => {
    try {
      return amount ? parseUnits(amount, 18) : 0n;
    } catch {
      return 0n;
    }
  })();

  // Read on a tick rather than during render: the clock is not a pure value,
  // and a component that reads it while rendering gives a different answer
  // every time React happens to re-run it.
  const [now, setNow] = useState(0);
  useEffect(() => {
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  const periodLeft =
    state && now > 0 && state.periodEnds > now
      ? Math.ceil((state.periodEnds - now) / 86_400_000)
      : 0;

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

        <div className="mt-10 max-w-[46rem]">
          <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-nav-text/45 uppercase">
            {stakingLive ? "Live" : "Not live yet"}
          </p>
          <h1 className="font-display mt-3 text-[2.75rem] leading-[1.02] font-semibold sm:text-[4rem]">
            Stake <span className="shellr-glass">$SHELLR</span>, earn WETH
          </h1>
          <p className="mt-4 text-[1.0625rem] leading-[1.6] text-nav-text/60">
            Rewards are funded from what the token actually makes. Nothing is
            minted, and no rate is promised.
          </p>
        </div>

        <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] lg:grid-cols-4">
          {[
            [
              "Total staked",
              state ? `${token(state.totalStaked, 0)} $SHELLR` : "—",
            ],
            ["Reward pot", state ? `${token(state.potWei, 4)} WETH` : "—"],
            [
              "Pays out",
              state
                ? `${token(state.perPeriodWei, 4)} WETH / ${state.durationDays}d`
                : "—",
            ],
            [
              "Period",
              periodLeft > 0 ? `${periodLeft} day(s) left` : "not running",
            ],
          ].map(([label, figure]) => (
            <div key={label} style={glass} className="px-6 py-5">
              <dt className="text-[0.6875rem] font-semibold tracking-[0.1em] text-nav-text/45 uppercase">
                {label}
              </dt>
              <dd className="font-display mt-2 text-[1.625rem] leading-none font-semibold">
                {figure}
              </dd>
            </div>
          ))}
        </dl>

        <div className="mt-10 grid gap-6 lg:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
          <section
            style={glass}
            className="h-fit rounded-[1.5rem] border border-white/12 p-6 sm:p-7"
          >
            <div className="flex gap-2">
              {(["stake", "unstake"] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  onClick={() => {
                    setMode(option);
                    setAmount("");
                  }}
                  className={`flex-1 rounded-xl px-3 py-2.5 text-[0.9375rem] font-semibold capitalize transition-colors ${
                    mode === option
                      ? "bg-nav-accent text-nav-accent-ink"
                      : "bg-white/[0.04] text-nav-text/55 hover:bg-white/[0.08]"
                  }`}
                >
                  {option}
                </button>
              ))}
            </div>

            <div className="mt-5">
              <div className="flex items-baseline justify-between">
                <span className="text-[0.75rem] font-semibold tracking-[0.1em] text-nav-text/45 uppercase">
                  Amount
                </span>
                <button
                  type="button"
                  onClick={() => max && setAmount(formatUnits(max, 18))}
                  className="text-[0.75rem] text-nav-text/45 underline-offset-4 hover:underline"
                >
                  {mode === "stake" ? "Wallet" : "Staked"}:{" "}
                  {max ? token(max) : "0"}
                </button>
              </div>
              <input
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                inputMode="decimal"
                placeholder="0.0"
                className={`${field} mt-2`}
              />
            </div>

            <WalletButton className="mt-5" />

            {ready && (
              <button
                type="button"
                disabled={busy !== null || parsed <= 0n}
                onClick={() =>
                  run(
                    mode,
                    mode === "stake"
                      ? () => stakeShellr(parsed)
                      : () => unstakeShellr(parsed),
                  )
                }
                className="mt-5 w-full rounded-xl bg-nav-accent px-5 py-3 text-[0.9375rem] font-semibold text-nav-accent-ink transition-opacity hover:opacity-85 disabled:opacity-40"
              >
                {busy === mode
                  ? mode === "stake"
                    ? "Staking…"
                    : "Unstaking…"
                  : mode === "stake"
                    ? "Stake $SHELLR"
                    : "Unstake"}
              </button>
            )}

            {!stakingLive && (
              <p className="mt-4 text-center text-[0.8125rem] leading-[1.6] text-nav-text/40">
                The staking contract is not deployed yet.
              </p>
            )}

            {error && (
              <p className="mt-4 text-[0.8125rem] leading-[1.5] break-words text-[#ff3a6e]">
                {error}
              </p>
            )}
          </section>

          <section
            style={glass}
            className="flex flex-col rounded-[1.5rem] border border-white/12 p-6 sm:p-8"
          >
            <h2 className="text-[0.75rem] font-semibold tracking-[0.12em] text-nav-text/45 uppercase">
              Your position
            </h2>

            <div className="mt-6 grid gap-6 sm:grid-cols-3">
              <div>
                <p className="text-[0.6875rem] tracking-[0.08em] text-nav-text/40 uppercase">
                  Staked
                </p>
                <p className="font-display mt-1 text-[2rem] leading-none font-semibold">
                  {state ? token(state.myStake, 0) : "—"}
                </p>
                <p className="mt-1 text-[0.75rem] text-nav-text/35">$SHELLR</p>
              </div>
              <div>
                <p className="text-[0.6875rem] tracking-[0.08em] text-nav-text/40 uppercase">
                  Share of pool
                </p>
                <p className="font-display mt-1 text-[2rem] leading-none font-semibold">
                  {state ? `${(state.share * 100).toFixed(2)}%` : "—"}
                </p>
                <p className="mt-1 text-[0.75rem] text-nav-text/35">
                  of every reward
                </p>
              </div>
              <div>
                <p className="text-[0.6875rem] tracking-[0.08em] text-nav-text/40 uppercase">
                  Earned
                </p>
                <p className="font-display mt-1 text-[2rem] leading-none font-semibold text-nav-accent">
                  {state ? token(state.earned, 5) : "—"}
                </p>
                <p className="mt-1 text-[0.75rem] text-nav-text/35">WETH</p>
              </div>
            </div>

            {ready && (
              <button
                type="button"
                disabled={busy !== null || !state || state.earned === 0n}
                onClick={() => run("claim", claimRewards)}
                className="mt-7 w-fit rounded-xl border border-white/16 px-6 py-3 text-[0.9375rem] font-semibold transition-opacity hover:opacity-85 disabled:opacity-30"
              >
                {busy === "claim" ? "Claiming…" : "Claim WETH"}
              </button>
            )}

            {/* The facts rail. Hairlines and a value on the right, so the whole
                arrangement can be read down the edge rather than in prose. */}
            <dl className="mt-8 border-t border-white/10">
              {[
                [
                  "Period",
                  periodLeft > 0 ? `${periodLeft} day(s) left` : "not running",
                ],
                ["Pays over", state ? `${state.durationDays} days` : "—"],
                ["Unstaking", "any time, no lock"],
                ["Claiming", "separate - unstaking does not collect"],
                ["Rewards come from", "creator fees, not new supply"],
              ].map(([label, value]) => (
                <div
                  key={label}
                  className="flex items-center justify-between gap-4 border-b border-white/10 py-3 text-[0.8125rem]"
                >
                  <dt className="text-nav-text/40">{label}</dt>
                  <dd className="text-right font-semibold">{value}</dd>
                </div>
              ))}
            </dl>

            <p className="mt-auto pt-8 text-[0.8125rem] leading-[1.7] text-nav-text/40">
              Your stake is yours: the contract refuses to move staked $SHELLR
              for anyone, including us. The reward pot is a separate matter — it
              sits in the contract and is recoverable by its owner, which is the
              standard arrangement for this design and worth knowing rather than
              guessing.
            </p>
          </section>
        </div>
      </div>
    </main>
  );
};
