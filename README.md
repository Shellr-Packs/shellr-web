<div align="center">

# shellr-web

**[shellr.trade](https://shellr.trade) - the pack-opening theatre, the vault, the stock desk.**

[![Next.js](https://img.shields.io/badge/next-16.2-ff3a6e?style=flat-square)](https://nextjs.org)
[![React](https://img.shields.io/badge/react-19.2-a6e62c?style=flat-square)](https://react.dev)
[![wagmi](https://img.shields.io/badge/wagmi-2.x-31d67a?style=flat-square)](https://wagmi.sh)
[![Deploy](https://img.shields.io/badge/deploy-vercel-white?style=flat-square)](https://vercel.com)

</div>

The front end. Next.js 16 App Router, React 19, Tailwind v4, wagmi and viem for
the chain, three.js for the pack that opens, and spring physics for everything
that moves.

```bash
npm install
cp .env.example .env.local
npm run dev          # http://localhost:3000
```

---

## The one environment variable that matters

```
NEXT_PUBLIC_PACKS_ADDRESS=
```

This is the switch between the two modes the site has, and it is worth
understanding before you change anything.

**Unset**, the site rolls packs in the browser and spends nothing. Every tier
works, the reveal animation plays, the vault fills up. It is a demonstration,
and a client-side roll is a roll the client can predict - which is fine for a
demonstration and would be fraud in a shop.

**Set**, the Buy button asks for a wallet, sends ETH to `ShellrPacks`, and shows
what the swap actually delivered.

Everything that branches on this reads `isLive` in
[`src/lib/chain/config.ts`](./src/lib/chain/config.ts) rather than testing for
the variable itself, so the day it is set the wallet button, the buy and the
vault all switch over together.

The deployed address is written into that file as a constant, not left to the
environment. The address is public the moment it exists, the site is deployed by
dragging a folder at a shell prompt, and a build that silently falls back to the
browser roll because a variable did not reach the host is the worst of the
failure modes. The variable still wins where it is set, for a testnet copy.

```
NEXT_PUBLIC_RPC_URL=https://rpc.mainnet.chain.robinhood.com
```

Optional. The public RPC is rate limited - put an Alchemy or Chainstack URL here
before any real traffic.

---

## Routes

| | |
|---|---|
| `/` | The hero, the tiers, the Pons Pack, the reveal |
| `/inventory` | The vault. What you pulled, what it is worth, sell back |
| `/compacks` | Community packs - line-ups anyone can propose, and vote on |
| `/launchpad` | Pons launchpad listings that packs can reach |
| `/stocks` | Stock Packs. One tokenized equity per pack, filled via Voxelithic |
| `/staking` | Stake $SHELLR, claim WETH |
| `/battles` | Head-to-head pack opening |
| `/docs` | How the draw works, in the language of somebody who has not read Solidity |

## Layout

```
src/
  app/            routes, fonts, metadata, the one API route
  views/          one file per route - the page's whole composition
  components/
    common/       header, nav, hero, packs, cases, panels, hud, scene, stocks
    animation/    spring-driven primitives
  lib/
    chain/        chain config, wagmi, deployed addresses, the ABIs the site calls
    packs/        the browser roll, the tier line-up, the Pons pack, formatting
    scene/        three.js setup, the pack model, the draco decoder
    site.ts       every string a crawler or a share card reads
  hooks/          adaptive grid, smooth scroll, window size, readouts
  utils/          seo, structured data, scene and animation helpers
public/
  assets/         pack art, coin marks, hero video, the TV model
  draco/          the decoder, served locally rather than from a CDN
```

Two conventions worth knowing before writing a component.

**The grid is rem-based and adaptive.** `useAdaptiveGrid` scales the whole
design across viewports rather than snapping at breakpoints. Hard pixel values
in a layout will look correct on your monitor and wrong on everyone else's.

**Motion is springs, not durations.** `@react-spring/web` throughout, with
`spring-text-engine` for text. There is a `ReducedMotion` provider and it is not
decorative - anything animated has to survive it being on.

## Fonts and the asset budget

Both faces are local files loaded with `next/font/local`, not a CDN import - for
the same reason the Draco decoder is served locally. A third-party round trip on
the critical path is what the asset budget cannot afford. Self-hosting also gets
`font-display: swap` and a generated fallback metric, so the layout does not jump
when they land.

`public/assets` is around 50 MB, most of it pack art and the hero video. That is
deliberate and it is the single biggest thing to look at before optimising
anything else.

---

## Deploying

Vercel, from this folder:

```bash
vercel --prod
```

`npm run build` locally first. The three.js scene and the font metrics are the
two things that fail at build rather than in dev.

---

## Where the rest lives

| | |
|---|---|
| [shellr-contracts](https://github.com/Shellr-Packs/shellr-contracts) | The draw, the bankroll, the commit queue |
| [shellr-keeper](https://github.com/Shellr-Packs/shellr-keeper) | Queues seeds, reveals packs |
| [shellr-sdk](https://github.com/Shellr-Packs/shellr-sdk) | Reads, calldata, and `verifyPack` |

The site currently carries its own trimmed ABIs in `src/lib/chain` rather than
importing the SDK. That is a decision with an expiry date on it: the SDK exists
now, and the duplication should collapse into it once the reveal sheet stops
changing shape every week.

## License

MIT. See [LICENSE](./LICENSE).
