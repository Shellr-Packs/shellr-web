import { getDefaultConfig } from "@rainbow-me/rainbowkit";
import {
  coinbaseWallet,
  phantomWallet,
  rabbyWallet,
  rainbowWallet,
  trustWallet,
  walletConnectWallet,
} from "@rainbow-me/rainbowkit/wallets";
import { http } from "wagmi";

import { robinhood } from "@/lib/chain/config";

/**
 * The wallet stack.
 *
 * `robinhood` is reused straight from `config.ts` rather than redeclared, so
 * the RPC override in `NEXT_PUBLIC_RPC_URL` keeps reaching both wagmi and the
 * `publicClient` the rest of the site reads through.
 */

/**
 * WalletConnect's project id, from https://cloud.reown.com - free.
 *
 * This is not a nice-to-have. Robinhood Wallet ships no browser extension: it
 * is a phone app, and a phone app reaches this site by scanning a WalletConnect
 * QR code. No project id, no Robinhood Wallet - on a site running on Robinhood
 * Chain. Same for Trust and Rainbow on mobile.
 */
const projectId =
  process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID ?? "MISSING_PROJECT_ID";

export const walletConnectReady = projectId !== "MISSING_PROJECT_ID";

/**
 * The list, written out rather than left to the default.
 *
 * RainbowKit's default omits Rabby, which is the wallet this chain's traffic
 * actually uses. Anything installed is detected over EIP-6963 and floats to an
 * "Installed" group above this list on its own, so the order here is what a
 * visitor with nothing installed sees.
 *
 * **MetaMask is deliberately absent.** Listing it here is worse than leaving it
 * out: RainbowKit's `metaMaskWallet` decides it is installed with a raw
 * `isMetaMask(window.ethereum)`, and `window.ethereum` is one slot that
 * whichever extension loaded first takes for itself. With Phantom holding it,
 * MetaMask reads as absent, drops into this list, and a click falls through to
 * WalletConnect - a spinner that never resolves. Left out, the EIP-6963
 * announcement is matched on nothing and MetaMask lands in "Installed" with a
 * working injected connector. Rabby and Phantom use `hasInjectedProvider`,
 * which looks past that single slot, so they are safe to name.
 *
 * `walletConnectWallet` is last and deliberate: it is the only door for every
 * phone wallet, Robinhood's included.
 *
 * Coinbase's connector reaches `@coinbase/cdp-sdk`, which lazily imports the
 * `@x402/*` packages. npm does not pull those on its own and the build dies on
 * eight unresolved modules, so they are pinned as optional dependencies. yarn
 * hid this by flattening differently - one of several things it was hiding.
 */
const wallets = [
  {
    groupName: "Recommended",
    wallets: [rabbyWallet, phantomWallet, trustWallet],
  },
  {
    groupName: "More",
    wallets: [rainbowWallet, coinbaseWallet, walletConnectWallet],
  },
];

export const wagmiConfig = getDefaultConfig({
  appName: "Shellr",
  appDescription: "Sealed packs of memecoins on Robinhood Chain",
  appUrl: "https://shellr.trade",
  projectId,
  wallets,
  chains: [robinhood],
  transports: {
    [robinhood.id]: http(),
  },
  // Wallet state survives a reload, so a returning buyer is not asked to
  // reconnect before every purchase.
  ssr: true,
});
