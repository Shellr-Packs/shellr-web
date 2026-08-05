"use client";

import { PageNav } from "@/components/common/nav/page-nav";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { TIERS } from "@/lib/packs/pool";

/**
 * `/launchpad` — coins launched on Pons, paired to a pack here.
 *
 * The page is a dashboard first and an explainer second. A launchpad's job is
 * to show what has launched; the pitch belongs in one line at the top and
 * nowhere else, because a visitor who has to read three paragraphs before
 * seeing a number has already decided this is a landing page.
 *
 * **Nothing is live.** The board is empty because there is nothing on it, not
 * because it is waiting for data - and the button says so at the point of
 * failure rather than in a banner above the fold.
 */

const glass: CSSProperties = {
  background:
    "linear-gradient(152deg, rgba(255,255,255,0.09), rgba(255,255,255,0.025) 40%, rgba(214,216,219,0.045))",
  backdropFilter: "blur(40px) saturate(160%)",
  WebkitBackdropFilter: "blur(40px) saturate(160%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.24), inset 0 -1px 0 rgba(255,255,255,0.05), 0 30px 90px rgba(0,0,0,0.6)",
};

const field =
  "w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[0.9375rem] text-nav-text placeholder:text-nav-text/35 transition-colors duration-[var(--duration-fast)] ease-entrance focus:border-nav-accent/60 focus:outline-none";

/**
 * What the board will show, and what it shows while empty.
 *
 * Written out as columns rather than hard-coded into the markup twice: the
 * empty state has to line up with the real rows, or the first launch makes the
 * page jump.
 */
const COLUMNS = [
  { key: "coin", label: "Coin", align: "left" as const },
  { key: "pack", label: "Paired pack", align: "left" as const },
  { key: "volume", label: "Volume", align: "right" as const },
  { key: "fees", label: "Fees earned", align: "right" as const },
  { key: "packs", label: "Packs opened", align: "right" as const },
  { key: "dropped", label: "Dropped to holders", align: "right" as const },
];

const Builder = ({ onClose }: { onClose: () => void }) => {
  const [name, setName] = useState("");
  const [ticker, setTicker] = useState("");
  const [logo, setLogo] = useState<string | null>(null);
  const [pack, setPack] = useState(TIERS[1]?.name ?? TIERS[0].name);
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

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Launch a coin"
      className="pons-fade fixed inset-0 z-[70] overflow-y-auto bg-black/88 font-sans text-nav-text backdrop-blur-lg"
    >
      <div
        onPointerDown={(event) => {
          if (event.target === event.currentTarget) onClose();
        }}
        className="flex min-h-full items-center justify-center px-4 py-8 sm:px-6"
      >
        <div
          style={glass}
          className="pons-rise relative w-full max-w-[40rem] rounded-[1.75rem] border border-white/14 p-6 sm:p-9"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-5 right-5 grid size-8 place-items-center rounded-full border border-white/14 bg-white/5 text-[1rem] leading-none text-nav-text/70 transition-colors hover:bg-white/12 hover:text-nav-text"
          >
            ×
          </button>

          <h2 className="font-display text-[2.25rem] leading-[var(--leading-display)] font-semibold text-nav-accent uppercase">
            Launch a coin
          </h2>

          <div className="mt-6 flex items-center gap-4">
            <label className="relative grid size-[5rem] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-white/20 bg-white/[0.03] text-center text-[0.6875rem] text-nav-text/40 transition-colors hover:border-white/40">
              {logo ? (
                // A data URL from the visitor's own disk: `next/image` would try
                // to optimise it through the server, which cannot see it.
                // eslint-disable-next-line @next/next/no-img-element
                <img src={logo} alt="" className="size-full object-cover" />
              ) : (
                <span className="px-2">Logo</span>
              )}
              <input
                type="file"
                accept="image/*"
                className="absolute inset-0 cursor-pointer opacity-0"
                onChange={(event) => pickLogo(event.target.files?.[0])}
              />
            </label>

            <div className="min-w-0 flex-1">
              <input
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Coin name"
                className={field}
              />
              <input
                value={ticker}
                onChange={(event) =>
                  setTicker(event.target.value.toUpperCase().slice(0, 10))
                }
                placeholder="Ticker"
                className={`${field} mt-2`}
              />
            </div>
          </div>

          <p className="mt-6 text-[0.75rem] font-semibold tracking-[0.1em] text-nav-text/45 uppercase">
            Paired pack
          </p>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TIERS.map((tier) => (
              <button
                key={tier.name}
                type="button"
                onClick={() => setPack(tier.name)}
                className={`rounded-xl px-3 py-2.5 text-left transition-colors ${
                  pack === tier.name
                    ? "bg-nav-accent text-nav-accent-ink"
                    : "bg-white/[0.04] text-nav-text/60 hover:bg-white/[0.08]"
                }`}
              >
                <span className="block text-[0.8125rem] font-semibold">
                  {tier.name.replace(" Pack", "")}
                </span>
                <span className="block text-[0.6875rem] opacity-70">
                  {tier.priceEth} ETH
                </span>
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setAttempted(true)}
            className="mt-7 flex w-full items-center justify-center gap-2 rounded-xl bg-nav-accent px-5 py-3 text-[0.9375rem] font-semibold text-nav-accent-ink transition-opacity hover:opacity-85"
          >
            Launch coin
            <span className="rounded-full bg-black/20 px-2 py-0.5 text-[0.5625rem] tracking-[0.1em] uppercase">
              Soon
            </span>
          </button>

          {attempted && (
            <p className="mt-3 text-center text-[0.8125rem] leading-[1.6] text-nav-accent">
              Soon. Creating the coin and routing its fees into a pack is not
              written yet.
            </p>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const LaunchpadView = () => {
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
              Launchpad
            </h1>
            <p className="mt-4 max-w-[34rem] text-[1.0625rem] leading-[1.6] text-nav-text/60">
              Launch a coin, pair it to a pack, and let its trading volume drop
              memes to the people holding it.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setBuilding(true)}
            className="shrink-0 rounded-xl bg-nav-accent px-7 py-4 text-[1rem] font-semibold text-nav-accent-ink transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-85"
          >
            Launch a coin
          </button>
        </div>

        <dl className="mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-[1.5rem] border border-white/10 bg-white/[0.06] lg:grid-cols-4">
          {[
            ["Coins launched", "0"],
            ["Fees routed", "0 ETH"],
            ["Packs opened", "0"],
            ["Dropped to holders", "0 ETH"],
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
              Launched coins
            </h2>
            <span className="text-[0.75rem] text-nav-text/30">
              Updated live once the first one lands
            </span>
          </div>

          <div
            style={glass}
            className="mt-4 overflow-hidden rounded-[1.5rem] border border-white/10"
          >
            <div className="hidden grid-cols-[2fr_1.2fr_1fr_1fr_1fr_1.2fr] gap-4 border-b border-white/10 px-6 py-3.5 lg:grid">
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
                Nothing launched yet
              </p>
              <p className="max-w-[26rem] text-[0.875rem] leading-[1.6] text-nav-text/40">
                The first coin paired to a pack shows up here, with what it
                traded and what it paid out.
              </p>
            </div>
          </div>
        </section>
      </div>

      {building && <Builder onClose={() => setBuilding(false)} />}
    </main>
  );
};
