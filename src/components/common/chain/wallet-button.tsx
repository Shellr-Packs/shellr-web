"use client";

import { ConnectButton } from "@rainbow-me/rainbowkit";

import { isLive } from "@/lib/chain/config";
import { useWallet } from "@/lib/chain/wallet";

/**
 * Connect, switch chain, or get out of the way.
 *
 * Three states in one button because they are three steps of one job: a buyer
 * who has connected but is on the wrong chain has not finished connecting, and
 * showing them a "Buy" that reverts is worse than showing them the step they
 * actually have to take.
 *
 * `ConnectButton.Custom` supplies the behaviour - which dialog opens, what
 * counts as the wrong network, what happens on a late-announcing extension -
 * while the markup below stays the site's own. The hand-rolled picker this
 * replaced had to be told about each wallet by hand, and was wrong about the
 * one that matters most here: Robinhood Wallet was missing from a site running
 * on Robinhood Chain.
 */

export const WalletButton = ({ className = "" }: { className?: string }) => {
  if (!isLive) return null;

  return (
    <ConnectButton.Custom>
      {({ account, chain, openConnectModal, openChainModal, mounted }) => {
        // Until RainbowKit has mounted, the connection is unknown - render the
        // inert shape rather than flashing "Connect" at someone already
        // connected.
        const ready = mounted;
        const connected = ready && account && chain;

        if (!ready) {
          return (
            <div
              aria-hidden="true"
              className={`${className} h-[3rem] w-full rounded-xl bg-white/[0.06]`}
            />
          );
        }

        if (!connected) {
          return (
            <div className={className}>
              <button
                type="button"
                onClick={openConnectModal}
                className="w-full rounded-xl bg-nav-accent px-5 py-3 text-[0.9375rem] font-semibold text-nav-accent-ink transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-85"
              >
                Connect wallet
              </button>
            </div>
          );
        }

        if (chain.unsupported) {
          return (
            <div className={className}>
              <button
                type="button"
                onClick={openChainModal}
                className="w-full rounded-xl border border-white/20 px-5 py-3 text-[0.9375rem] font-semibold transition-opacity duration-[var(--duration-fast)] ease-entrance hover:opacity-85"
              >
                Switch to Robinhood Chain
              </button>
            </div>
          );
        }

        return null;
      }}
    </ConnectButton.Custom>
  );
};

/** The connected address, short. */
export const useShortAddress = (): string | null => {
  const address = useWallet((state) => state.address);
  return address ? `${address.slice(0, 6)}…${address.slice(-4)}` : null;
};
