import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";

import { Web3Provider } from "@/components/common/chain/web3-provider";

import { siteConfig } from "@/lib/site";
import {
  generateMetadata,
  generateViewport,
} from "@/utils/seo/generate-page-metadata";
import { getSiteStructuredData } from "@/utils/seo/structured-data";

import { LazyCookie } from "@/components/common/Cookie";
import { AdaptiveGrid } from "@/components/common/grid";
import { ReducedMotion } from "@/components/common/reduced-motion";
import { ScrollLayout } from "@/layouts/scroll-layout";

import "@/app/globals.css";

/**
 * The two faces the design is drawn in, both supplied as files.
 *
 * `next/font/local` over a CDN import for the same reason the Draco decoder is
 * served locally: a third-party round trip on the critical path is what the
 * asset budget cannot afford. It also self-hosts with `font-display: swap` and a
 * generated fallback metric, so the layout does not jump when they land.
 */
const chakraPetch = localFont({
  variable: "--font-chakra-petch",
  display: "swap",
  src: [
    { path: "./fonts/ChakraPetch-Regular.ttf", weight: "400", style: "normal" },
    { path: "./fonts/ChakraPetch-SemiBold.ttf", weight: "600", style: "normal" },
  ],
});

/** The display face — an *inline* one: its strokes are drawn hollow. */
const bigShoulders = localFont({
  variable: "--font-big-shoulders",
  display: "swap",
  src: [
    {
      path: "./fonts/BigShouldersInline-Regular.ttf",
      weight: "400",
      style: "normal",
    },
  ],
});

/**
 * The site's metadata, and the one place the title template lives — a template
 * rewrites the titles its *descendants* declare, so a second one further down
 * would compound rather than override.
 */
export const metadata: Metadata = generateMetadata({
  titleTemplate: `%s - ${siteConfig.name}`,
});
export const viewport: Viewport = generateViewport();

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang={siteConfig.language}>
      <body className={`${chakraPetch.variable} ${bigShoulders.variable}`}>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify(getSiteStructuredData()),
          }}
        />
        <Web3Provider>
          <ScrollLayout>
            <AdaptiveGrid />
            <ReducedMotion />
            <LazyCookie />
            {children}
          </ScrollLayout>
        </Web3Provider>
      </body>
    </html>
  );
}
