"use client";

import { PageNav } from "@/components/common/nav/page-nav";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { TIERS } from "@/lib/packs/pool";

/**
 * `/battles` — two players open the same packs, the bigger total takes both.
 *
 * Built to the shape of `/launchpad`, and for the same reason: this is a board
 * that will one day have rows on it, so it is a board now, with the empty
 * state sized like a real row. A page that reflows the first time it has data
 * teaches the visitor that the numbers moved when they did not.
 *
 * **Nothing here takes money.** There is no battle contract - the mechanic is
 * described, the lobby is drawn, and every button that would settle a wager
 * says so where it is pressed rather than in a banner that scrolls away. A
 * board that looked live while settling nothing would be the worst version of
 * this page, so the "Soon" is attached to the action, not the header.
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
 * What the board will show, and what it shows while empty.
 *
 * Kept as columns rather than written into the markup twice, so the empty
 * state lines up with the real rows when the first lobby opens.
 */
const COLUMNS = [
  { key: "host", label: "Host", align: "left" as const },
  { key: "pack", label: "Pack", align: "left" as const },
  { key: "rounds", label: "Rounds", align: "right" as const },
  { key: "entry", label: "Entry", align: "right" as const },
  { key: "pot", label: "Pot", align: "right" as const },
  { key: "state", label: "", align: "right" as const },
];

/** Rounds a battle can run. More rounds, less luck, same edge. */
const ROUNDS = [1, 3, 5];

const HOW = [
  {
    title: "Pick a pack and a length",
    body: "Both sides open the same pack the same number of times. One round is a coin flip; five rounds is closer to the odds on the sheet.",
  },
  {
    title: "Open a lobby, or join one",
    body: "A new battle gets a code you can send to someone, and a row on the board anyone can take. Whoever fills the second seat starts it.",
  },
  {
    title: "Both sides open at once",
    body: "The same commit-reveal that settles a solo pack settles a battle, drawn once for the pair. Neither side can see a result before the other.",
  },
  {
    title: "The bigger total takes both",
    body: "Every coin either side pulled goes to whoever pulled more by value across all rounds. The 2% fee comes off entry, same as anywhere else.",
  },
];

const Builder = ({ onClose }: { onClose: () => void }) => {
  const [pack, setPack] = useState(TIERS[1]?.name ?? TIERS[0].name);
  const [rounds, setRounds] = useState(3);
  const [attempted, setAttempted] = useState(false);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", key);
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", key);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  const tier = TIERS.find((entry) => entry.name === pack) ?? TIERS[0];
  const entry = (Number(tier.priceEth) * rounds).toFixed(3).replace(/0+$/, "");

  return createPortal(
    <div
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
      className="pons-fade fixed inset-0 z-[80] flex items-center justify-center bg-black/85 px-4 font-sans text-nav-text backdrop-blur-lg"
    >
      <div
        style={glass}
        className="pons-rise relative w-full max-w-[26rem] rounded-[1.5rem] border border-white/14 p-7"
      >
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="absolute top-4 right-4 grid size-8 place-items-center rounded-full bg-white/[0.07] text-nav-text/60 transition-colors hover:bg-white/[0.13] hover:text-nav-text"
        >
          <svg
            viewBox="0 0 24 24"
            aria-hidden="true"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            className="size-4"
          >
            <path d="M6 6l12 12M18 6L6 18" />
          </svg>
        </button>

        <h2 className="text-[1.0625rem] font-semibold">Create a battle</h2>
        <p className="mt-1.5 text-[0.8125rem] leading-[1.55] text-nav-text/50">
          Your opponent opens whatever you pick, for the same price.
        </p>

        <p className="mt-6 text-[0.6875rem] font-semibold tracking-[0.1em] text-nav-text/45 uppercase">
          Pack
        </p>
        <div className="mt-2 grid grid-cols-2 gap-2">
          {TIERS.map((option) => (
            <button
              key={option.name}
              type="button"
              onClick={() => setPack(option.name)}
              className={`rounded-xl px-3 py-2.5 text-left transition-colors ${
                pack === option.name
                  ? "bg-nav-accent text-nav-accent-ink"
                  : "bg-white/[0.04] text-nav-text/60 hover:bg-white/[0.08]"
              }`}
            >
              <span className="block text-[0.8125rem] font-semibold">
                {option.name.replace(" Pack", "")}
              </span>
              <span className="block text-[0.6875rem] opacity-70">
                {option.priceEth} ETH
              </span>
            </button>
          ))}
        </div>

        <p className="mt-6 text-[0.6875rem] font-semibold tracking-[0.1em] text-nav-text/45 uppercase">
          Rounds
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2">
          {ROUNDS.map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => setRounds(option)}
              className={`rounded-xl px-3 py-2.5 text-center text-[0.8125rem] font-semibold transition-colors ${
                rounds === option
                  ? "bg-nav-accent text-nav-accent-ink"
                  : "bg-white/[0.04] text-nav-text/60 hover:bg-white/[0.08]"
              }`}
            >
              {option}
            </button>
          ))}
        </div>

        <div className="mt-6 flex items-baseline justify-between border-t border-white/10 pt-4">
          <span className="text-[0.8125rem] text-nav-text/50">Your entry</span>
          <span className="font-display text-[1.5rem] leading-none font-semibold">
            {entry} ETH
          </span>
        </div>

        <button
          type="button"
          onClick={() => setAttempted(true)}
          className="mt-6 flex w-full items-center justify-center gap-2 rounded-xl bg-nav-accent px-5 py-3 text-[0.9375rem] font-semibold text-nav-accent-ink transition-opacity hover:opacity-85"
        >
          Open the lobby
          <span className="rounded-full bg-black/20 px-2 py-0.5 text-[0.5625rem] tracking-[0.1em] uppercase">
            Soon
          </span>
        </button>

        {attempted && (
          <p className="mt-3 text-center text-[0.8125rem] leading-[1.6] text-nav-accent">
            Soon. Packs open one player at a time for now — the contract that
            settles two of them against each other is not written yet, so
            nothing here would take your ETH.
          </p>
        )}
      </div>
    </div>,
    document.body,
  );
};

export const BattlesView = () => {
  const [building, setBuilding] = useState(false);

  return (
    <main className="min-h-dvh bg-black px-6 pt-6 pb-10 font-sans text-nav-text sm:px-10 sm:pt-7 sm:pb-14">
      {/* One wash of light behind the board, so the glass has something to
          catch. Fixed rather than scrolled: it is the room, not the page. */}
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

        <div className="mt-10 flex flex-col gap-8 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-nav-text/45 uppercase">
              Not live yet
            </p>
            <h1 className="font-display mt-2 text-[3.5rem] leading-[0.92] font-semibold text-nav-accent sm:text-[5.5rem]">
              Pack Battles
            </h1>
            <p className="mt-4 max-w-[34rem] text-[1.0625rem] leading-[1.6] text-nav-text/60">
              Open the same packs as somebody else, at the same time. Whoever
              pulls more by value takes every coin off both sides.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setBuilding(true)}
            className="shrink-0 rounded-xl bg-nav-accent px-7 py-4 text-[1rem] font-semibold text-nav-accent-ink transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-85"
          >
            Create a battle
          </button>
        </div>

        <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] lg:grid-cols-4">
          {[
            ["Battles played", "0"],
            ["Wagered", "0 ETH"],
            ["Biggest pot", "0 ETH"],
            ["Open lobbies", "0"],
          ].map(([label, figure]) => (
            <div key={label} style={glass} className="px-6 py-5">
              <dt className="text-[0.6875rem] font-semibold tracking-[0.1em] text-nav-text/45 uppercase">
                {label}
              </dt>
              <dd className="font-display mt-2 text-[2rem] leading-none font-semibold">
                {figure}
              </dd>
            </div>
          ))}
        </dl>

        <section className="mt-10">
          <div className="flex items-baseline justify-between">
            <h2 className="text-[0.75rem] font-semibold tracking-[0.12em] text-nav-text/45 uppercase">
              Open lobbies
            </h2>
            <span className="text-[0.75rem] text-nav-text/30">
              Anyone can take the second seat
            </span>
          </div>

          <div
            style={glass}
            className="mt-4 overflow-hidden rounded-[1.5rem] border border-white/10"
          >
            <div className="hidden grid-cols-[1.6fr_1.2fr_1fr_1fr_1fr_1fr] gap-4 border-b border-white/10 px-6 py-3.5 lg:grid">
              {COLUMNS.map((column) => (
                <span
                  key={column.key}
                  className={`text-[0.6875rem] font-semibold tracking-[0.1em] text-nav-text/40 uppercase ${
                    column.align === "right" ? "text-right" : ""
                  }`}
                >
                  {column.label}
                </span>
              ))}
            </div>

            <div className="flex flex-col items-center gap-3 px-6 py-24 text-center">
              <p className="font-display text-[1.75rem] leading-none font-semibold text-nav-text/70">
                No lobbies open
              </p>
              <p className="max-w-[26rem] text-[0.875rem] leading-[1.6] text-nav-text/40">
                Battles are not running yet. When they are, every lobby waiting
                for a second player sits here with its pack, its length and
                what is in the pot.
              </p>
            </div>
          </div>
        </section>

        <section className="mt-14">
          <h2 className="text-[0.75rem] font-semibold tracking-[0.12em] text-nav-text/45 uppercase">
            How a battle works
          </h2>

          <ol className="mt-4 grid gap-px overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] lg:grid-cols-4">
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
            A battle does not change the odds of a pack. Each side draws from
            the same seven payout bands a solo pack draws from — 0.20× to 1.70×
            of the stake, published on the contract — and the fee is the same
            2%. What changes is where the coins land: instead of both sides
            keeping what they pulled, one side keeps all of it.
          </p>
        </section>
      </div>

      {building && <Builder onClose={() => setBuilding(false)} />}
    </main>
  );
};
