"use client";

import { useCallback, useEffect, useState } from "react";

import type { Pull, Rarity } from "@/lib/packs/pool";

/**
 * What a visitor is holding, kept in `localStorage`.
 *
 * **Local, not on-chain.** There is no wallet and no contract behind this yet;
 * the store is here so the flow — buy, open, keep or sell — can be walked end to
 * end and looked at. When the contracts land this file is the seam: the page
 * and the opener only ever call the four functions below, so they can be
 * repointed at a wallet without either of them changing.
 *
 * Written through a custom event as well as `storage`, because `storage` only
 * fires in *other* tabs — the opener and the inventory page are usually the
 * same one.
 */

const KEY = "shellr.vault.v1";
const CHANGED = "shellr:vault";

export interface Holding {
  ticker: string;
  name: string;
  rarity: Rarity;
  art: string;
  units: number;
  valueEth: number;
}

export interface Vault {
  holdings: Holding[];
  /** ETH taken out by selling pulls, cumulative. */
  soldEth: number;
  /** Packs opened, all tiers. */
  packs: number;
}

const EMPTY: Vault = { holdings: [], soldEth: 0, packs: 0 };

const read = (): Vault => {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return EMPTY;
    const parsed = JSON.parse(raw) as Partial<Vault>;
    return {
      holdings: Array.isArray(parsed.holdings) ? parsed.holdings : [],
      soldEth: typeof parsed.soldEth === "number" ? parsed.soldEth : 0,
      packs: typeof parsed.packs === "number" ? parsed.packs : 0,
    };
  } catch {
    // Corrupt or unreadable storage is an empty vault, not a crash.
    return EMPTY;
  }
};

const write = (vault: Vault): void => {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(KEY, JSON.stringify(vault));
  } catch {
    // Private mode, quota, whatever — the session still works, it just will
    // not survive a reload.
  }
  window.dispatchEvent(new CustomEvent(CHANGED));
};

/** Fold a pack's pulls into what is already held, merging by ticker. */
export const keepPulls = (pulls: Pull[]): void => {
  const vault = read();
  const byTicker = new Map(vault.holdings.map((h) => [h.ticker, { ...h }]));
  for (const pull of pulls) {
    const held = byTicker.get(pull.ticker);
    if (held) {
      held.units += pull.units;
      held.valueEth += pull.valueEth;
    } else {
      byTicker.set(pull.ticker, { ...pull });
    }
  }
  write({
    holdings: [...byTicker.values()],
    soldEth: vault.soldEth,
    packs: vault.packs + 1,
  });
};

/**
 * What a sell-back keeps, after the platform's cut.
 *
 * `sellBack` on `ShellrPacks` takes 2% of the ETH the swap returns, so the
 * figure the vault records is the figure that would reach a wallet — recording
 * the gross would make "Sold" a number nobody was ever paid.
 */
export const SELL_FEE = 0.02;

export const netOfFee = (gross: number): number => gross * (1 - SELL_FEE);

/** Take the ETH instead — the pulls never enter the vault. */
export const sellPulls = (pulls: Pull[]): void => {
  const vault = read();
  write({
    holdings: vault.holdings,
    soldEth:
      vault.soldEth + netOfFee(pulls.reduce((s, p) => s + p.valueEth, 0)),
    packs: vault.packs + 1,
  });
};

/** Sell one line already in the vault. */
export const sellHolding = (ticker: string): void => {
  const vault = read();
  const held = vault.holdings.find((h) => h.ticker === ticker);
  if (!held) return;
  write({
    holdings: vault.holdings.filter((h) => h.ticker !== ticker),
    soldEth: vault.soldEth + netOfFee(held.valueEth),
    packs: vault.packs,
  });
};

export const clearVault = (): void => write(EMPTY);

/**
 * The vault, live.
 *
 * Starts empty on the server and on the first client render, then fills in an
 * effect: reading `localStorage` during render is what makes the markup the
 * server sent and the markup the client builds disagree.
 */
export const useVault = (): Vault & { ready: boolean } => {
  const [vault, setVault] = useState<Vault>(EMPTY);
  const [ready, setReady] = useState(false);

  const sync = useCallback(() => setVault(read()), []);

  useEffect(() => {
    sync();
    setReady(true);
    window.addEventListener(CHANGED, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(CHANGED, sync);
      window.removeEventListener("storage", sync);
    };
  }, [sync]);

  return { ...vault, ready };
};
