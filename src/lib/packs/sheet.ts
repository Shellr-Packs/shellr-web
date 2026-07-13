import { create } from "zustand";

import { TIERS } from "@/lib/packs/pool";

/**
 * Which pack sheet is open, for the whole page.
 *
 * The two sheets are opened from opposite ends of the route — the Pons Pack
 * from the hero's button, a tier from the carousel in the 3D scene — and those
 * two live in different trees with a Server Component between them. Lifting
 * state to a common parent would mean making that parent a client component and
 * threading a callback through the scene; a store is the cheaper seam, and it
 * is what makes stepping *between* sheets possible at all: the arrows walk one
 * list that both sheets are on.
 */

export type PackTarget = { kind: "pons" } | { kind: "tier"; name: string };

/** The order the arrows walk, cheapest first, with the Pons Pack in front. */
const ORDER: PackTarget[] = [
  { kind: "pons" },
  ...TIERS.map((tier) => ({ kind: "tier" as const, name: tier.name })),
];

const indexOf = (target: PackTarget): number =>
  ORDER.findIndex((entry) =>
    entry.kind === "pons"
      ? target.kind === "pons"
      : target.kind === "tier" && target.name === entry.name,
  );

interface PackSheetState {
  target: PackTarget | null;
  open: (target: PackTarget) => void;
  close: () => void;
  /** `1` moves to the next pack, `-1` to the previous. Wraps both ways. */
  step: (delta: number) => void;
}

export const usePackSheet = create<PackSheetState>((set) => ({
  target: null,
  open: (target) => set({ target }),
  close: () => set({ target: null }),
  step: (delta) =>
    set((state) => {
      if (!state.target) return state;
      const at = indexOf(state.target);
      if (at < 0) return state;
      const next = (at + delta + ORDER.length) % ORDER.length;
      return { target: ORDER[next] };
    }),
}));
