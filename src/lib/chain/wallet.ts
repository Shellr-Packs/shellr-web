"use client";

import {
  createPublicClient,
  createWalletClient,
  custom,
  http,
  type Address,
  type Hash,
  type EIP1193Provider,
} from "viem";
import { create } from "zustand";

import { robinhood } from "@/lib/chain/config";

/**
 * The wallet, in about eighty lines.
 *
 * Injected providers only — no WalletConnect, no connector library. That is a
 * deliberate limit rather than a shortcut: the alternative pulls in a project
 * id, a relay and several megabytes to serve an audience that is already
 * holding a browser wallet, on a chain their wallet has to be told about
 * anyway. If mobile wallets become the audience, this is the file that changes.
 *
 * Reads never wait for a wallet: `publicClient` talks to the RPC directly, so
 * the sheet can show the fee, the caps and the line-up before anyone connects.
 */

export const publicClient = createPublicClient({
  chain: robinhood,
  transport: http(),
});

interface WalletState {
  address: Address | null;
  /** Which wallet is connected, for showing its name back to the visitor. */
  wallet: Wallet | null;
  chainId: number | null;
  connecting: boolean;
  error: string | null;
  connect: (wallet?: Wallet) => Promise<void>;
  disconnect: () => void;
  /** Ask the wallet to move to Robinhood Chain, adding it if it is unknown. */
  switchChain: () => Promise<void>;
  walletClient: () => ReturnType<typeof createWalletClient> | null;
}

/**
 * Every wallet on the machine, not one of them.
 *
 * EIP-6963 exists because `window.ethereum` is a single slot that whichever
 * extension loaded first takes for itself - which is why picking MetaMask by
 * hand worked and also why it was wrong: on a machine with Rabby and no
 * MetaMask, the site had nothing to offer.
 *
 * Wallets announce themselves on an event, so the listener is installed as
 * this module loads. By the time somebody clicks a button the announcements
 * have long since fired.
 */
export interface Wallet {
  id: string;
  name: string;
  icon?: string;
  provider: EIP1193Provider;
}

const discovered = new Map<string, Wallet>();
const listeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("eip6963:announceProvider", (event) => {
    const detail = (event as CustomEvent).detail as {
      info?: { rdns?: string; uuid?: string; name?: string; icon?: string };
      provider?: EIP1193Provider;
    };
    const info = detail?.info;
    const id = info?.rdns ?? info?.uuid ?? info?.name;
    if (!id || !detail.provider || discovered.has(id)) return;
    discovered.set(id, {
      id,
      name: info?.name ?? id,
      icon: info?.icon,
      provider: detail.provider,
    });
    for (const notify of listeners) notify();
  });
  window.dispatchEvent(new Event("eip6963:requestProvider"));
}

/**
 * The list, with the legacy singleton as a last resort.
 *
 * Older wallets never announce. If nothing has, whatever is in
 * `window.ethereum` is still better than an empty picker.
 */
export const wallets = (): Wallet[] => {
  const found = [...discovered.values()];
  if (found.length > 0) return found;
  if (typeof window === "undefined") return [];
  const injected = (
    window as { ethereum?: EIP1193Provider & { isMetaMask?: boolean } }
  ).ethereum;
  return injected
    ? [
        {
          id: "injected",
          name: injected.isMetaMask ? "MetaMask" : "Browser wallet",
          provider: injected,
        },
      ]
    : [];
};

/** Re-render a picker when a wallet announces itself late. */
export const onWalletsChanged = (notify: () => void): (() => void) => {
  listeners.add(notify);
  return () => listeners.delete(notify);
};

export const useWallet = create<WalletState>((set, get) => ({
  address: null,
  wallet: null,
  chainId: null,
  connecting: false,
  error: null,

  connect: async (chosen?: Wallet) => {
    const picked = chosen ?? wallets()[0];
    if (!picked) {
      set({
        error:
          "No browser wallet found. Install MetaMask, Rabby, or any other wallet extension.",
      });
      return;
    }
    const eth = picked.provider;
    set({ connecting: true, error: null });
    try {
      const accounts = (await eth.request({
        method: "eth_requestAccounts",
      })) as Address[];
      const chainId = Number(await eth.request({ method: "eth_chainId" }));
      set({
        address: accounts[0] ?? null,
        wallet: picked,
        chainId,
        connecting: false,
      });

      // The wallet outlives this store: a change of account or chain has to
      // land here, or the site keeps quoting a balance that is not on screen.
      eth.on?.("accountsChanged", (accs) =>
        set({ address: (accs as Address[])[0] ?? null }),
      );
      eth.on?.("chainChanged", (id) => set({ chainId: Number(id) }));
    } catch (error) {
      set({
        connecting: false,
        error:
          error instanceof Error ? error.message : "Could not connect a wallet",
      });
    }
  },

  disconnect: () =>
    set({ address: null, wallet: null, chainId: null, error: null }),

  switchChain: async () => {
    const eth = get().wallet?.provider;
    if (!eth) return;
    const hex = `0x${robinhood.id.toString(16)}`;
    try {
      await eth.request({
        method: "wallet_switchEthereumChain",
        params: [{ chainId: hex }],
      });
    } catch {
      // 4902 and its cousins mean the wallet has never heard of this chain.
      await eth.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hex,
            chainName: robinhood.name,
            nativeCurrency: robinhood.nativeCurrency,
            rpcUrls: [robinhood.rpcUrls.default.http[0]],
            blockExplorerUrls: [robinhood.blockExplorers.default.url],
          },
        ],
      });
    }
    set({ chainId: robinhood.id });
  },

  walletClient: () => {
    const { address, wallet } = get();
    const eth = wallet?.provider;
    if (!eth || !address) return null;
    return createWalletClient({
      account: address,
      chain: robinhood,
      transport: custom(eth),
    });
  },
}));

/**
 * Wait for a transaction, and refuse to call a revert a success.
 *
 * `waitForTransactionReceipt` resolves for a reverted transaction exactly as
 * it does for a mined one - the difference is `status`, and eight call sites
 * used to drop it on the floor. The cost of that was not theoretical: an
 * unstake that reverted cleared the form, reloaded the page and left the
 * staker believing their tokens had moved.
 */
export const confirmTx = async (hash: Hash, what: string) => {
  const receipt = await publicClient.waitForTransactionReceipt({ hash });
  if (receipt.status !== "success") {
    throw new Error(`${what} reverted on chain (${hash})`);
  }
  return receipt;
};

export const onRightChain = (chainId: number | null): boolean =>
  chainId === robinhood.id;
