"use client";

import { PageNav } from "@/components/common/nav/page-nav";
import Image from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useState, type CSSProperties } from "react";
import { createPortal } from "react-dom";

import { WalletButton } from "@/components/common/chain/wallet-button";
import {
  MAX_PACK_COINS,
  createCommunityPack,
  friendlyError,
  lookupToken,
  readCommunityPacks,
  retireCommunityPack,
  votePack,
  type CommunityPack,
} from "@/lib/chain/packs";
import { onRightChain, useWallet } from "@/lib/chain/wallet";

/**
 * `/compacks` — packs built by the people who buy them.
 *
 * The page is a shelf with one button on it. The builder lives in a sheet
 * behind that button, on the same glass as the pack sheets, because it is the
 * same kind of moment: a thing you open, fill in, and close.
 *
 * **Creating does not work, and the sheet says so at the point of failure**
 * rather than in a banner nobody reads. Everything up to that point is real —
 * a coin is looked up on the chain and checked for a Uniswap pool as it is
 * added — so the form is worth opening even now: it answers whether a coin
 * could be packed at all. What it cannot do is publish, because no contract
 * exists that lets a stranger put a pack on the shelf.
 */

const glass: CSSProperties = {
  background:
    "linear-gradient(152deg, rgba(255,255,255,0.10), rgba(255,255,255,0.03) 38%, rgba(214,216,219,0.05))",
  backdropFilter: "blur(40px) saturate(160%)",
  WebkitBackdropFilter: "blur(40px) saturate(160%)",
  boxShadow:
    "inset 0 1px 0 rgba(255,255,255,0.28), inset 0 -1px 0 rgba(255,255,255,0.06), 0 30px 90px rgba(0,0,0,0.6)",
};

const field =
  "w-full rounded-xl border border-white/12 bg-white/[0.04] px-4 py-3 text-[0.9375rem] text-nav-text placeholder:text-nav-text/35 transition-colors duration-[var(--duration-fast)] ease-entrance focus:border-nav-accent/60 focus:outline-none";

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;

interface Coin {
  address: string;
  symbol: string;
  name: string;
  /** The v3 fee tier its ETH pool trades in, or null if it has none. */
  poolFee: number | null;
}

const Builder = ({ onClose }: { onClose: () => void }) => {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("0.02");
  const [logo, setLogo] = useState<string | null>(null);
  const [coins, setCoins] = useState<Coin[]>([]);
  const [address, setAddress] = useState("");
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const wallet = useWallet((state) => state.address);
  const chainId = useWallet((state) => state.chainId);
  const ready = !!wallet && onRightChain(chainId);

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

  const addCoin = async () => {
    const token = address.trim();
    if (!ADDRESS.test(token)) {
      setError("That is not a contract address - 0x and 40 hex characters.");
      return;
    }
    if (
      coins.some((coin) => coin.address.toLowerCase() === token.toLowerCase())
    ) {
      setError("That coin is already in this pack.");
      return;
    }
    if (coins.length >= MAX_PACK_COINS) {
      setError(`A pack holds at most ${MAX_PACK_COINS} coins.`);
      return;
    }
    setLooking(true);
    setError(null);
    try {
      const found = await lookupToken(token as `0x${string}`);
      setCoins((current) => [
        ...current,
        {
          address: found.address,
          symbol: found.symbol,
          name: found.name,
          poolFee: found.poolFee,
        },
      ]);
      setAddress("");
      if (found.poolFee === null) {
        setError(
          `$${found.symbol} has no Uniswap pool against ETH - a pack cannot buy it.`,
        );
      }
    } catch (lookupError) {
      console.error(lookupError);
      setError(friendlyError(lookupError));
    } finally {
      setLooking(false);
    }
  };

  const pickLogo = (file: File | undefined) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setLogo(String(reader.result));
    reader.readAsDataURL(file);
  };

  const tradable = coins.filter((coin) => coin.poolFee !== null).length;

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create a pack"
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
          className="pons-rise relative w-full max-w-[42rem] rounded-[1.75rem] border border-white/14 p-6 sm:p-9"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-5 right-5 grid size-8 place-items-center rounded-full border border-white/14 bg-white/5 text-[1rem] leading-none text-nav-text/70 transition-colors hover:bg-white/12 hover:text-nav-text"
          >
            ×
          </button>

          <p className="text-[0.6875rem] tracking-[0.28em] text-nav-accent/80 uppercase">
            Community
          </p>
          <h2 className="mt-1 font-display text-[2.5rem] leading-[var(--leading-display)] font-semibold text-nav-accent uppercase">
            Create a pack
          </h2>

          <div className="mt-6 flex items-center gap-4">
            <label className="relative grid size-[5.5rem] shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border border-dashed border-white/20 bg-white/[0.03] text-center text-[0.6875rem] text-nav-text/40 transition-colors hover:border-white/40">
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
                placeholder="Pack name"
                className={field}
              />
              <input
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                inputMode="decimal"
                placeholder="Price in ETH"
                className={`${field} mt-2`}
              />
            </div>
          </div>

          <textarea
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            rows={2}
            placeholder="What is this pack, and why these coins?"
            className={`${field} mt-3 resize-none`}
          />

          <p className="mt-6 text-[0.75rem] font-semibold tracking-[0.1em] text-nav-text/45 uppercase">
            Coins
          </p>
          <div className="mt-2 flex gap-2">
            <input
              value={address}
              onChange={(event) => setAddress(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void addCoin();
              }}
              placeholder="0x… contract address"
              className={field}
            />
            <button
              type="button"
              onClick={() => void addCoin()}
              disabled={looking}
              className="shrink-0 rounded-xl border border-white/14 px-4 py-3 text-[0.875rem] font-semibold transition-opacity hover:opacity-85 disabled:opacity-40"
            >
              {looking ? "Checking…" : "Add"}
            </button>
          </div>

          {coins.length > 0 && (
            <>
              <ul className="mt-3 flex flex-col gap-2">
                {coins.map((coin) => (
                  <li
                    key={coin.address}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] font-semibold">
                        ${coin.symbol}
                      </span>
                      <span className="block truncate text-[0.6875rem] text-nav-text/40">
                        {coin.name}
                      </span>
                    </span>
                    <span
                      className="shrink-0 rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold tracking-[0.06em] uppercase"
                      style={
                        coin.poolFee === null
                          ? { borderColor: "#ff3a6e55", color: "#ff3a6e" }
                          : { borderColor: "#31d67a55", color: "#31d67a" }
                      }
                    >
                      {coin.poolFee === null
                        ? "No pool"
                        : `${coin.poolFee / 10000}% pool`}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setCoins((current) =>
                          current.filter(
                            (entry) => entry.address !== coin.address,
                          ),
                        )
                      }
                      aria-label={`Remove ${coin.symbol}`}
                      className="shrink-0 text-[1rem] leading-none text-nav-text/40 transition-colors hover:text-nav-text"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-[0.75rem] leading-[1.5] text-nav-text/45">
                {tradable} of {coins.length} buyable on Uniswap.
                {tradable < coins.length &&
                  " A pack cannot draw a coin it cannot buy."}
              </p>
            </>
          )}

          {error && (
            <p className="mt-4 text-[0.8125rem] leading-[1.5] break-words text-[#ff3a6e]">
              {error}
            </p>
          )}

          <WalletButton className="mt-6" />
          {ready && (
            <button
              type="button"
              disabled={saving}
              onClick={() => {
                const priceEth = Number.parseFloat(price);
                if (!name.trim()) return setError("Give the pack a name.");
                if (coins.length === 0)
                  return setError("A pack needs at least one coin.");
                if (!Number.isFinite(priceEth) || priceEth <= 0)
                  return setError("Set a price above zero.");
                setSaving(true);
                setError(null);
                void createCommunityPack(
                  name.trim(),
                  priceEth,
                  coins.map((coin) => coin.address as `0x${string}`),
                )
                  .then(() => onClose())
                  .catch((problem) => {
                    console.error(problem);
                    setError(friendlyError(problem));
                  })
                  .finally(() => setSaving(false));
              }}
              className="mt-6 w-full rounded-xl bg-nav-accent px-5 py-3 text-[0.9375rem] font-semibold text-nav-accent-ink transition-opacity hover:opacity-85 disabled:opacity-50"
            >
              {saving ? "Putting it on the shelf…" : "Create pack"}
            </button>
          )}

          <p className="mt-3 text-center text-[0.6875rem] leading-[1.5] text-nav-text/35">
            One signature, no ETH. The pack is registered on-chain, so it is on
            the shelf for everybody - not saved in this browser.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
};

const PROMISES = [
  {
    title: "You pick the coins",
    body: "Any token on Robinhood Chain with a pool deep enough to buy from. The builder checks each one against Uniswap as you paste it in.",
  },
  {
    title: "You set the terms",
    body: "A price, how many coins drop, and the odds each meme is drawn at - published with the pack, the way ours are.",
  },
  {
    title: "You earn on every sale",
    body: "A share of the fee on each pack sold, for as long as it sells. The split is not decided yet, and a number published before it can be honoured is worse than none.",
  },
];

/**
 * One pack, opened.
 *
 * The shelf shows addresses because that is all the contract stores; this looks
 * each one up so the pack can be read rather than decoded. The lookups are done
 * here, on demand, rather than for every card on the shelf - forty cards would
 * be four hundred calls into a public node.
 */
const PackDetail = ({
  pack,
  onClose,
  onVoted,
}: {
  pack: CommunityPack;
  onClose: () => void;
  onVoted: () => void;
}) => {
  const [coins, setCoins] = useState<
    Array<{
      address: string;
      symbol: string;
      name: string;
      poolFee: number | null;
    }>
  >([]);
  const [voting, setVoting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wallet = useWallet((state) => state.address);
  const chainId = useWallet((state) => state.chainId);
  const ready = !!wallet && onRightChain(chainId);

  useEffect(() => {
    let alive = true;
    void Promise.all(
      pack.coins.map((coin) =>
        lookupToken(coin as `0x${string}`)
          .then((found) => ({
            address: coin,
            symbol: found.symbol,
            name: found.name,
            poolFee: found.poolFee,
          }))
          .catch(() => ({
            address: coin,
            symbol: "?",
            name: "Could not read this token",
            poolFee: null,
          })),
      ),
    ).then((rows) => {
      if (alive) setCoins(rows);
    });
    return () => {
      alive = false;
    };
  }, [pack]);

  const vote = (up: boolean) => {
    setVoting(true);
    setError(null);
    void votePack(pack.id, up)
      .then(onVoted)
      .catch((problem) => {
        console.error(problem);
        setError(friendlyError(problem));
      })
      .finally(() => setVoting(false));
  };

  return createPortal(
    <div
      role="dialog"
      aria-modal="true"
      aria-label={pack.name}
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
          className="pons-rise relative w-full max-w-[38rem] rounded-[1.75rem] border border-white/14 p-6 sm:p-9"
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="absolute top-5 right-5 grid size-8 place-items-center rounded-full border border-white/14 bg-white/5 text-[1rem] leading-none text-nav-text/70 transition-colors hover:bg-white/12 hover:text-nav-text"
          >
            ×
          </button>

          <h2 className="font-display text-[2.25rem] leading-[var(--leading-display)] font-semibold text-nav-accent">
            {pack.name}
          </h2>
          <p className="mt-1 text-[0.875rem] text-nav-text/50">
            {pack.priceEth} ETH · {pack.coins.length}{" "}
            {pack.coins.length === 1 ? "coin" : "coins"} · by{" "}
            {pack.builder.slice(0, 6)}…{pack.builder.slice(-4)}
          </p>

          <ul className="mt-6 flex flex-col gap-2">
            {(coins.length
              ? coins
              : pack.coins.map((c) => ({
                  address: c,
                  symbol: "…",
                  name: "Reading…",
                  poolFee: null,
                }))
            ).map((coin) => (
              <li
                key={coin.address}
                className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[0.9375rem] font-semibold">
                    ${coin.symbol}
                  </span>
                  <span className="block truncate text-[0.6875rem] text-nav-text/40">
                    {coin.name}
                  </span>
                </span>
                {coin.poolFee === null ? (
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold tracking-[0.06em] uppercase"
                    style={{ borderColor: "#ff3a6e55", color: "#ff3a6e" }}
                  >
                    No pool
                  </span>
                ) : (
                  <span
                    className="shrink-0 rounded-full border px-2 py-0.5 text-[0.625rem] font-semibold tracking-[0.06em] uppercase"
                    style={{ borderColor: "#31d67a55", color: "#31d67a" }}
                  >
                    {coin.poolFee / 10000}% pool
                  </span>
                )}
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center gap-3 border-t border-white/10 pt-5">
            <button
              type="button"
              disabled={!ready || voting}
              onClick={() => vote(true)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[0.9375rem] font-semibold transition-colors disabled:opacity-40 ${
                pack.myVote === 1
                  ? "border-transparent bg-nav-accent text-nav-accent-ink"
                  : "border-white/14 hover:bg-white/8"
              }`}
            >
              Class {pack.likes}
            </button>
            <button
              type="button"
              disabled={!ready || voting}
              onClick={() => vote(false)}
              className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-[0.9375rem] font-semibold transition-colors disabled:opacity-40 ${
                pack.myVote === 2
                  ? "border-transparent bg-white text-black"
                  : "border-white/14 hover:bg-white/8"
              }`}
            >
              Trash {pack.dislikes}
            </button>
            {!ready && (
              <span className="text-[0.75rem] text-nav-text/40">
                Connect a wallet to vote
              </span>
            )}
          </div>

          {error && (
            <p className="mt-3 text-[0.8125rem] leading-[1.5] break-words text-[#ff3a6e]">
              {error}
            </p>
          )}
          <p className="mt-3 text-[0.6875rem] leading-[1.5] text-nav-text/30">
            Votes live on the contract, one per wallet, changeable. Tap the same
            button again to take yours back.
          </p>
        </div>
      </div>
    </div>,
    document.body,
  );
};

export const CompacksView = () => {
  const [building, setBuilding] = useState(false);
  const [shelf, setShelf] = useState<CommunityPack[] | null>(null);
  const wallet = useWallet((state) => state.address);

  const [open, setOpen] = useState<CommunityPack | null>(null);

  // Wrapped so the effect below can depend on it honestly rather than lying to
  // the linter about what it uses.
  const load = useCallback(
    () =>
      readCommunityPacks(wallet ?? undefined)
        .then((packs) => {
          setShelf(packs);
          setOpen((current) =>
            current ? (packs.find((p) => p.id === current.id) ?? null) : null,
          );
        })
        .catch(() => setShelf([])),
    [wallet],
  );

  useEffect(() => {
    void load();
  }, [building, load]);

  return (
    <main className="min-h-dvh bg-black px-6 pt-6 pb-10 font-sans text-nav-text sm:px-10 sm:pt-7 sm:pb-14">
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

        <div className="mt-8 flex flex-col gap-8 border-b border-nav-surface pb-8 xl:flex-row xl:items-end xl:justify-between">
          <div>
            <p className="text-[0.6875rem] font-semibold tracking-[0.12em] text-nav-text/45 uppercase">
              Not live yet
            </p>
            <h1 className="mt-2 font-display text-[3.25rem] leading-[var(--leading-display)] font-semibold text-nav-accent sm:text-[4.5rem]">
              Community packs
            </h1>
            <p className="mt-3 max-w-[40rem] text-[1.0625rem] leading-[1.6] text-nav-text/60">
              Build a pack out of the memes you believe in and put it on the
              shelf beside ours. Registered on-chain, up to ten coins, and{" "}
              <span className="text-nav-text">
                take a cut of every one that sells
              </span>
              . The builder&apos;s share comes out of the platform fee, not out
              of the buyer&apos;s coins - what a pack spends on memes is what
              the buyer paid, whoever built it.
            </p>
          </div>

          <button
            type="button"
            onClick={() => setBuilding(true)}
            className="shrink-0 rounded-xl bg-nav-accent px-6 py-3.5 text-[1rem] font-semibold text-nav-accent-ink transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-85"
          >
            Create pack
          </button>
        </div>

        <section className="mt-12 grid gap-4 lg:grid-cols-3">
          {PROMISES.map((item) => (
            <div
              key={item.title}
              style={glass}
              className="rounded-[1.5rem] border border-white/12 p-6"
            >
              <h2 className="text-[1.0625rem] font-semibold">{item.title}</h2>
              <p className="mt-2 text-[0.875rem] leading-[1.6] text-nav-text/60">
                {item.body}
              </p>
            </div>
          ))}
        </section>

        <section className="mt-12">
          <h2 className="text-[0.75rem] font-semibold tracking-[0.12em] text-nav-text/45 uppercase">
            On the shelf
          </h2>

          {shelf === null ? (
            <p className="mt-4 text-[0.9375rem] text-nav-text/40">
              Reading the chain…
            </p>
          ) : shelf.length === 0 ? (
            <div
              style={glass}
              className="mt-4 flex flex-col items-center gap-3 rounded-[1.5rem] border border-white/12 px-6 py-20 text-center"
            >
              <p className="text-[1.25rem] text-nav-text/70">
                No community packs yet.
              </p>
              <p className="max-w-[32rem] text-[0.875rem] leading-[1.6] text-nav-text/45">
                Build the first one. It is registered on-chain, so it stays on
                the shelf whoever is looking.
              </p>
            </div>
          ) : (
            <ul className="mt-4 grid gap-4 sm:grid-cols-2 2xl:grid-cols-3">
              {shelf.map((pack) => (
                <li
                  key={pack.id}
                  style={glass}
                  className="flex flex-col rounded-[1.5rem] border border-white/12 p-5"
                >
                  <div className="flex items-start justify-between gap-3">
                    <span className="min-w-0">
                      <span className="font-display block truncate text-[1.5rem] leading-[var(--leading-display)] font-semibold">
                        {pack.name}
                      </span>
                      <span className="mt-0.5 block text-[0.8125rem] text-nav-text/50">
                        {pack.priceEth} ETH · {pack.coins.length}{" "}
                        {pack.coins.length === 1 ? "coin" : "coins"}
                      </span>
                    </span>
                    {!pack.live && (
                      <span className="shrink-0 rounded-full border border-white/15 px-2.5 py-1 text-[0.625rem] font-semibold tracking-[0.08em] text-nav-text/40 uppercase">
                        Retired
                      </span>
                    )}
                  </div>

                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {pack.coins.map((coin) => (
                      <li
                        key={coin}
                        title={coin}
                        className="rounded-full border border-white/12 px-2.5 py-1 text-[0.6875rem] font-semibold text-nav-text/70"
                      >
                        {coin.slice(0, 6)}…{coin.slice(-4)}
                      </li>
                    ))}
                  </ul>

                  <div className="mt-5 flex items-center justify-between gap-3 border-t border-white/10 pt-4">
                    <button
                      type="button"
                      onClick={() => setOpen(pack)}
                      className="text-[0.8125rem] font-semibold text-nav-accent underline-offset-4 hover:underline"
                    >
                      Open pack
                    </button>
                    <span className="text-[0.75rem] text-nav-text/40">
                      {pack.likes} / {pack.dislikes}
                    </span>
                    {pack.live &&
                      wallet?.toLowerCase() === pack.builder.toLowerCase() && (
                        <button
                          type="button"
                          onClick={() =>
                            void retireCommunityPack(pack.id).then(load)
                          }
                          className="text-[0.8125rem] text-nav-text/40 underline underline-offset-4 transition-opacity hover:opacity-70"
                        >
                          Retire
                        </button>
                      )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {building && <Builder onClose={() => setBuilding(false)} />}
      {open && (
        <PackDetail
          pack={open}
          onClose={() => setOpen(null)}
          onVoted={() => void load()}
        />
      )}
    </main>
  );
};
