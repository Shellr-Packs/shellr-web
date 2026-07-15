"use client";

import "@rainbow-me/rainbowkit/styles.css";

import { RainbowKitProvider, darkTheme } from "@rainbow-me/rainbowkit";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState, type ReactNode } from "react";
import type { EIP1193Provider } from "viem";
import { WagmiProvider, useAccount } from "wagmi";

import { wagmiConfig } from "@/lib/chain/wagmi";
import { useWallet } from "@/lib/chain/wallet";

/**
 * RainbowKit, wagmi, and a bridge back to the store the site already had.
 *
 * The bridge is the point. `packs.ts` and `staking.ts` reach for
 * `useWallet.getState().walletClient()` in nine places to sign a buy, a sell,
 * a stake, an approval - the paths that move money. Rewriting those to call
 * wagmi directly would have put the whole purchase flow into the same change
 * as a dialog restyle. Instead wagmi owns connecting, and `WalletSync` copies
 * the result into `useWallet`. Every existing caller keeps working untouched,
 * and `walletClient()` still builds from a plain EIP-1193 provider exactly as
 * it did before.
 */

const theme = darkTheme({
  accentColor: "#d6d8db",
  accentColorForeground: "#0a0a0a",
  borderRadius: "large",
  overlayBlur: "small",
});

/**
 * Copies wagmi's connection into `useWallet`.
 *
 * The provider is fetched rather than read: wagmi hands out a connector, and
 * the underlying EIP-1193 object comes off it asynchronously. `live` guards
 * the write because a visitor can disconnect - or switch wallets - while that
 * promise is still open, and a late resolve must not resurrect a connection
 * that has already gone.
 */
const WalletSync = () => {
  const { address, chainId, connector, status } = useAccount();

  useEffect(() => {
    let live = true;

    if (status !== "connected" || !address || !connector) {
      useWallet.setState({ address: null, wallet: null, chainId: null });
      return;
    }

    void connector
      .getProvider()
      .then((provider) => {
        if (!live) return;
        useWallet.setState({
          address,
          chainId: chainId ?? null,
          connecting: false,
          error: null,
          wallet: {
            id: connector.id,
            name: connector.name,
            icon: connector.icon,
            provider: provider as EIP1193Provider,
          },
        });
      })
      .catch(() => {
        if (live) useWallet.setState({ error: "Could not reach the wallet" });
      });

    return () => {
      live = false;
    };
  }, [address, chainId, connector, status]);

  return null;
};

export const Web3Provider = ({ children }: { children: ReactNode }) => {
  // One client, created once. A new QueryClient on every render throws away
  // every cached read on each re-render.
  const [queryClient] = useState(() => new QueryClient());

  return (
    <WagmiProvider config={wagmiConfig}>
      <QueryClientProvider client={queryClient}>
        <RainbowKitProvider
          theme={theme}
          modalSize="wide"
          appInfo={{ appName: "Shellr" }}
          // No `initialChain`. Setting it makes RainbowKit ask the wallet to
          // switch networks as part of connecting - and Robinhood Chain is a
          // chain almost nobody has added yet, so that request stalls behind an
          // add-network prompt and the connect spinner never resolves. Connect
          // first; the button below handles the wrong network afterwards.
        >
          <WalletSync />
          {children}
        </RainbowKitProvider>
      </QueryClientProvider>
    </WagmiProvider>
  );
};
