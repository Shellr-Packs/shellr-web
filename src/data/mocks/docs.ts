/**
 * Copy and structure for the `/docs` section.
 *
 * One page per idea rather than one long scroll: somebody who has opened the
 * documentation is after a number or a rule, and a page they can link to and
 * come back to is worth more than a heading two thousand words down.
 *
 * **Two rules for editing this file.**
 *
 * 1. The odds, bands and sizing below restate what the code actually does —
 *    `lib/packs/pool.ts` for the demo, `contracts/src/ShellrPacks.sol` for the
 *    chain. Them disagreeing is the one failure a docs page cannot recover
 *    from, so change them together or not at all.
 * 2. Nothing here may describe an unshipped thing in the present tense. A page
 *    for something designed and not deployed carries `soon: true`, which greys
 *    its sidebar entry and prints a banner at the top of it.
 */

export interface DocsBlock {
  text?: string;
  list?: string[];
  table?: { head: string[]; rows: string[][] };
  note?: string;
  /** A sub-heading inside a page. Also what the right-hand contents lists. */
  heading?: string;
  /** A monospace band — a flow, a signature, a command. */
  code?: string;
}

export interface DocsPage {
  slug: string;
  title: string;
  /** Sidebar label, when the title is too long for it. */
  short?: string;
  description: string;
  lead: string;
  blocks: DocsBlock[];
  /** Nothing is built yet — the page says so and the sidebar greys it out. */
  soon?: boolean;
}

export interface DocsGroup {
  title: string;
  pages: string[];
}

/** The sidebar, in the order the product is met. */
export const DOCS_NAV: DocsGroup[] = [
  { title: "Getting started", pages: ["", "quickstart", "concepts"] },
  { title: "Packs", pages: ["pons-pack", "packs", "odds", "fees"] },
  {
    title: "Protocol",
    pages: ["architecture", "fairness", "keeper", "contracts"],
  },
  { title: "Reference", pages: ["addresses", "faq", "risk"] },
  {
    title: "Roadmap",
    pages: ["roadmap", "launchpad", "battles", "staking", "borrow", "token"],
  },
];

/** Which group a page sits in — printed above its title. */
export const docsGroup = (slug: string): string =>
  DOCS_NAV.find((group) => group.pages.includes(slug))?.title ?? "";

export const DOCS_PAGES: DocsPage[] = [
  {
    slug: "",
    title: "Introduction",
    description:
      "Shellr sells sealed packs of memecoins on Robinhood Chain. Pay in ETH, open on-chain, coins land in your wallet.",
    lead: "Shellr sells sealed packs of memecoins on Robinhood Chain. You put ETH in, the pack is opened on-chain, and the coins it drew arrive in your wallet. Which coins is the part nobody knows in advance - including us.",
    blocks: [
      { heading: "The shape of it" },
      { code: "stake  ->  commit  ->  reveal  ->  swap  ->  your wallet" },
      {
        text: "Nothing skips a step. The seed a pack is drawn from is committed on-chain before the pack is bought, the draw is settled in the reveal, and the coins are bought at market in the same transaction that settles it. If the reveal never lands, the stake comes back to you.",
      },
      { heading: "What you are actually buying" },
      {
        text: "A pack spends a multiple of your stake on memecoins at the price the market is asking. The multiple is drawn from the same committed seed as the coins, from a published table: most packs land near even, the worst spends a fifth of the stake, the best a little over one and a half times it. Averaged out a pack returns about 92% of what it cost, which is the house's edge and is stated here rather than hidden in the odds.",
      },
      {
        text: "That is a deliberate design rather than a limitation. A pack that could pay ten times would have to be funded by packs that paid nothing, and that is a different product with a different set of laws around it.",
      },
      { heading: "Three things worth knowing before you spend" },
      {
        list: [
          "The coins are ordinary ERC-20s. Shellr never holds them - the swap sends them straight from the router to you.",
          "The fee is 2%, taken once, at the moment the pack settles. Nothing is taken from a pack that never settles.",
          "Memecoins are volatile and thin. What a pack is worth an hour later is not something anyone here controls.",
        ],
      },
      {
        note: "Shellr is not an investment product and nothing in these docs is financial advice.",
      },
    ],
  },
  {
    slug: "quickstart",
    title: "Quickstart",
    description: "From a cold start to coins in your wallet.",
    lead: "Four steps. The only decision you make is how much to stake.",
    blocks: [
      {
        list: [
          "Connect a wallet on Robinhood Chain (chain ID 4663) with a little ETH in it - for the stake and for gas, which is negligible here.",
          "Open the Pons Pack sheet from the front page and name your stake. The sheet prints how many coins that buys and what leaves your wallet.",
          "Confirm. That single transaction pays for the pack and takes the next committed seed off the queue.",
          "Wait a beat. The keeper reveals the pack, the swaps run, and the coins appear in your wallet - you do not sign a second time.",
        ],
      },
      { heading: "If nothing arrives" },
      {
        text: "A pack that has not been revealed within ten minutes can be refunded by the buyer, in full, fee included. That is a function on the contract, not a support request - nobody has to agree to it.",
      },
      {
        note: "The site you are reading this on runs the draw in your browser as a demonstration. It is not connected to the contract yet, so nothing there spends real ETH. See Roadmap for where that stands.",
      },
    ],
  },
  {
    slug: "concepts",
    title: "Core concepts",
    description:
      "Stake, slice, band, draw, reveal - the five words the rest of the docs assume.",
    lead: "Five words carry the whole protocol. Everything else is detail hanging off them.",
    blocks: [
      {
        table: {
          head: ["Word", "What it means"],
          rows: [
            [
              "Stake",
              "The ETH you put into one pack, less the fee. Every wei of it is spent on coins.",
            ],
            [
              "Slice",
              "The stake divided by the number of coins drawn. One slice buys one coin.",
            ],
            [
              "Band",
              "A coin's tier - mythic, legendary, epic, rare, common. The draw picks a band first, then a coin inside it.",
            ],
            [
              "Draw",
              "One slice landing on one coin. A pack is many draws, and repeats merge into a single line.",
            ],
            [
              "Reveal",
              "The transaction that settles the draw and runs the swaps. Until it lands, nothing has been decided.",
            ],
          ],
        },
      },
      { heading: "Why the count is derived, not chosen" },
      {
        text: "A pack does not have a coin count printed on it by hand. The contract divides the stake by a slice size and wobbles the result by a quarter either way, so a bigger stake buys more coins rather than bigger ones. That keeps a single slice roughly constant in ETH terms, which is what stops one draw from moving the price of a thin pool on its own.",
      },
      { heading: "Repeats are normal" },
      {
        text: "Ten draws against ten coins will not give you ten different coins, and it is not meant to. The reveal merges repeats into one line with a larger amount rather than printing the same ticker ten times.",
      },
    ],
  },
  {
    slug: "pons-pack",
    title: "The Pons Pack",
    short: "Pons Pack",
    description:
      "One pack, priced by whatever you stake, drawing from the Pons launchpad only.",
    lead: "The Pons Pack has no fixed price. You name a stake and the pack sizes itself to it - the only pack on the site that works this way.",
    blocks: [
      { heading: "What is in it" },
      {
        text: "Every coin the Pons Pack can draw launched on Pons. There is one pool and no tier list; a larger stake does not unlock a different line-up, it buys more of the same one.",
      },
      { heading: "Stake and size" },
      {
        table: {
          head: ["You pay", "Spent on coins", "Coins drawn"],
          rows: [
            ["0.01 ETH", "0.0098 ETH", "2-3"],
            ["0.02 ETH", "0.0196 ETH", "2-4"],
            ["0.05 ETH", "0.049 ETH", "7-11"],
            ["0.1 ETH", "0.098 ETH", "15-23"],
            ["0.25 ETH", "0.245 ETH", "23-30"],
          ],
        },
      },
      {
        text: "The fee comes out of what you send rather than being added to it, so the second column is what actually reaches the pools. The minimum is 0.005 ETH and the ceiling is 0.25 ETH. The ceiling is not an economic choice - it is how much a bug in an unaudited contract is allowed to cost, and it moves only after review.",
      },
      { heading: "Keeping or selling" },
      {
        text: "There is nothing to claim. The coins are sent to your wallet by the swap itself, so keeping them is the default and costs no further transaction. Selling one back is a single call that swaps it to ETH at market and takes the same 2% off what comes out.",
      },
    ],
  },
  {
    slug: "packs",
    title: "The five tiers",
    short: "Tiers",
    description:
      "Fixed-price packs with their own line-ups and floor guarantees.",
    lead: "Beside the Pons Pack sit five fixed-price tiers. What changes between them is how many coins drop, which coins the tier can reach, and the band it guarantees.",
    blocks: [
      {
        table: {
          head: ["Tier", "Price", "Coins drawn", "Floor"],
          rows: [
            ["Basic Pack", "0.01 ETH", "1-5", "none"],
            ["Common Pack", "0.02 ETH", "2-7", "none"],
            ["Rare Pack", "0.05 ETH", "3-10", "at least one Rare"],
            ["Starter Pack", "0.1 ETH", "5-15", "at least one Epic"],
            ["Premium Pack", "0.5 ETH", "10-20", "at least one Legendary"],
          ],
        },
      },
      { heading: "Each tier has its own line-up" },
      {
        text: "A tier does not draw from the whole pool. The Basic Pack tops out at Rare and cannot produce a Legendary at any odds, while PONS and CASHCAT appear in the Premium Pack and nowhere else. Paying more buys a better line-up, not just more rolls at the same one.",
      },
      { heading: "What a floor does" },
      {
        text: "A floor guarantees the named band appears at least once. It does not cap what else can turn up, and it is rolled first, so the guarantee holds whatever the remaining draws do.",
      },
      {
        note: "The tiers run in the browser today and are not yet wired to the contract. The Pons Pack is the shape the on-chain product takes first; the tiers follow it.",
      },
    ],
  },
  {
    slug: "odds",
    title: "Odds",
    description: "The published band table every Shellr draw is rolled against.",
    lead: "Every coin sits in a band, assigned from its all-time-high market cap. The draw picks a band, then picks evenly among the live coins in it.",
    blocks: [
      {
        table: {
          head: ["Band", "Coins", "Chance per draw"],
          rows: [
            ["Mythic", "PONS, CASHCAT", "0.4%"],
            ["Legendary", "ARTIFICIAL INU, NETNET", "2%"],
            ["Epic", "THINKING CAT, TENDIES", "6.5%"],
            ["Rare", "MICRODUCK, DELTA", "15%"],
            ["Common", "THE JUGGERNAUT, HOOKR.FUN", "76.1%"],
          ],
        },
      },
      { heading: "Per draw, not per pack" },
      {
        text: "The chance above applies to each draw separately. A pack making twenty draws has a far better shot at a mythic than one making three - the per-draw number is identical, the number of chances is not.",
      },
      { heading: "A band with nothing in it" },
      {
        text: "If every coin in a band is switched off - a pool that has dried up, a token that has stopped trading - the draw falls through to the next band down rather than reverting. That is why a coin can be removed from the line-up without the odds table having to be rewritten.",
      },
      {
        note: "Odds are fixed and published. They are not weighted by wallet, by purchase history, or by how many packs you have opened, and there is no pity counter - a hundred bad packs do not improve the next one.",
      },
      { heading: "Where these numbers live" },
      {
        text: "The band table is stored on the contract, readable by anyone, and changeable only by the owner in a transaction you can see. This page restates it; the contract is the copy that matters.",
      },
    ],
  },
  {
    slug: "fees",
    title: "Fees and settlement",
    short: "Fees and settlement",
    description:
      "What Shellr takes, when it takes it, and what happens if a pack never settles.",
    lead: "One fee, 2%, taken once. Everything else that leaves your wallet is either spent on coins or comes back to you.",
    blocks: [
      {
        table: {
          head: ["Event", "What is taken"],
          rows: [
            [
              "Buying a pack",
              "Nothing. The full amount is held by the contract.",
            ],
            [
              "Revealing a pack",
              "2% to the treasury; the remaining 98% is spent on coins.",
            ],
            ["Selling a coin back", "2% of the ETH the swap returns."],
            [
              "Refunding an unrevealed pack",
              "Nothing. You get the whole amount, fee included.",
            ],
          ],
        },
      },
      { heading: "Slippage is not a fee" },
      {
        text: "Each swap carries a minimum output, quoted moments before the reveal is sent and tolerating a 3% move. Thin pools cost you more than deep ones, and that cost goes to the pool, not to Shellr. If the market moves past the tolerance the reveal fails rather than filling you at a price nobody agreed to, and it is retried.",
      },
      { heading: "The refund is yours to take" },
      {
        text: "Ten minutes after a purchase, an unrevealed pack can be refunded by the buyer directly. Nobody needs to approve it, the operator cannot block it, and it returns the full amount paid. It is the backstop for the one thing that can genuinely go wrong here: the keeper being down.",
      },
      {
        note: "There is no owner withdrawal of pack ETH on the contract. Every wei is either spent on your coins or refundable to you, and adding a way out of that would break the guarantee this page is making.",
      },
    ],
  },
  {
    slug: "architecture",
    title: "Architecture",
    description:
      "How a purchase becomes coins: contract, keeper, router, and why it takes two transactions.",
    lead: "Two transactions, one signature. Here is why, and what each piece is responsible for.",
    blocks: [
      { heading: "Why two transactions" },
      {
        text: "A draw settled in the same transaction that pays for it is a draw the buyer can simulate first and abandon if they do not like it. The fix is randomness that does not exist yet when the money is committed - which usually means Chainlink VRF.",
      },
      {
        text: "VRF is not available here. Chainlink went live on Robinhood Chain from block zero with CCIP, Data Streams and Data Feeds, and VRF is not among them; its supported-networks list covers Arbitrum, Avalanche, Base, BNB, Ethereum, OP, Polygon, Ronin and Soneium, and not this chain. So Shellr uses commit-reveal instead, described in full under Provable fairness.",
      },
      { heading: "Who does what" },
      {
        table: {
          head: ["Piece", "Responsibility"],
          rows: [
            [
              "ShellrPacks",
              "Holds the stake, owns the odds, settles the draw, runs the swaps, honours refunds.",
            ],
            [
              "The keeper",
              "Keeps seeds committed ahead of demand and reveals every pack that has been bought.",
            ],
            [
              "SwapRouter02",
              "Executes each swap. Shellr never quotes its own price.",
            ],
            [
              "Your wallet",
              "The recipient of every coin. Nothing is held on your behalf.",
            ],
          ],
        },
      },
      { heading: "One signature, not two" },
      {
        text: "The buyer signs once. The reveal is sent by the keeper, which pays its own gas - so the second transaction exists but it is not your problem. The keeper cannot change what a pack drew; it can only publish the seed that was already committed, or fail to, and failing to is what the refund is for.",
      },
      { heading: "Why the keeper quotes the swaps" },
      {
        text: "Because it can. It holds the secret, so it can compute the exact draw before sending the reveal, ask the quoter what each slice will return, and pass those minimums into the transaction. That is the only reason the draw arithmetic exists twice - once in Solidity, once in the keeper - and the two are pinned to the same test vectors so they cannot drift apart quietly.",
      },
    ],
  },
  {
    slug: "fairness",
    title: "Provable fairness",
    short: "Provable fairness",
    description:
      "How the draw is committed before you buy, and how to check a settled pack yourself.",
    lead: "Neither side can steer a pack. The operator is committed before your seed exists; you never see the secret until it has already been used.",
    blocks: [
      { heading: "The three inputs" },
      { code: "seed = keccak256(secret, clientSeed, packId, buyer)" },
      {
        list: [
          "secret - the operator's, published as keccak256(secret) on-chain before any pack can consume it.",
          "clientSeed - yours, sent with the purchase. Random bytes from your browser, or anything you like.",
          "packId and buyer - fixed by the purchase itself, chosen by nobody.",
        ],
      },
      { heading: "Why that is enough" },
      {
        text: "The operator commits a queue of hashed secrets in advance and each purchase takes the next one, so choosing a favourable seed after seeing a buy is not possible - the seed was fixed before the buy existed. It does not work in the other direction either: the secret is not published until the reveal, so your seed is chosen blind.",
      },
      { heading: "Checking a pack after the fact" },
      {
        list: [
          "Find the SeedsCommitted event that published your pack's commitment, and check it is older than your purchase.",
          "Take the secret out of the reveal transaction's calldata and hash it - it must equal that commitment.",
          "Rebuild the seed from the four inputs above, then run the same band and count arithmetic the contract does.",
          "Compare with the CoinDelivered events on your reveal. They must match exactly.",
        ],
      },
      {
        text: "The contract exposes drawSeed, drawCount and drawPick as read-only calls for exactly this, so a check does not require reimplementing anything - you can ask the contract what it would have drawn and compare it with what it did.",
      },
      {
        note: "This proves the draw was not tampered with. It does not make a pack a good deal, and it does not make a memecoin worth holding.",
      },
    ],
  },
  {
    slug: "keeper",
    title: "The keeper",
    description:
      "The service that commits seeds and reveals packs, and what it can and cannot do.",
    lead: "A single long-running process with two jobs, both dull on purpose.",
    blocks: [
      {
        list: [
          "Keep the seed queue full. A commitment must be on-chain before the pack that consumes it is bought, so the queue is refilled well ahead of demand - and buying reverts rather than borrowing against an empty one.",
          "Reveal every pack. It recomputes the draw, quotes each swap, and sends the reveal with per-coin minimums.",
        ],
      },
      { heading: "What it cannot do" },
      {
        text: "It cannot change a draw, censor a buyer, or take a pack's ETH. Its only power is over timing: it can reveal, or it can be down. If it is down, the refund window opens and the buyer takes their money back without anyone's cooperation.",
      },
      { heading: "What it holds" },
      {
        text: "A hot key with gas in it, and one master secret from which every pack's secret is derived. The key is worth little to steal - it can only reveal packs. The master secret is different: anyone holding it can predict what a pack will drop before buying it. They still cannot change it, but they can wait for a good one, which is why it lives apart from everything else.",
      },
      { heading: "When it fails loudly" },
      {
        text: "A coin configured against a fee tier that has no pool will fail its quote on every attempt, and the packs that drew it stall until they are refunded. That is the loudest failure in the system, and the reason pool depth is checked before a coin is ever added.",
      },
    ],
  },
  {
    slug: "contracts",
    title: "Contracts",
    description:
      "The functions a caller can reach on ShellrPacks, and who can reach them.",
    lead: "One contract. No proxy, no upgrade path, no dependencies - what is deployed is what was read.",
    blocks: [
      {
        table: {
          head: ["Function", "Who calls it", "What it does"],
          rows: [
            [
              "buy(clientSeed)",
              "Anyone",
              "Pays for a pack and takes the next committed seed. Payable.",
            ],
            [
              "reveal(packId, secret, minOuts)",
              "Keeper",
              "Settles the draw and runs the swaps to the buyer.",
            ],
            [
              "refund(packId)",
              "Buyer",
              "Returns the full amount once the reveal window has passed.",
            ],
            [
              "sellBack(token, fee, amount, minOut)",
              "Anyone",
              "Swaps a coin back to ETH, less 2%. Needs an approval first.",
            ],
            [
              "drawSeed / drawCount / drawPick",
              "Anyone",
              "Read-only. The draw arithmetic, for checking a settled pack.",
            ],
            [
              "allCoins / bandBps / seedsLeft",
              "Anyone",
              "Read-only. The current line-up, odds table and queue depth.",
            ],
          ],
        },
      },
      { heading: "What the owner can change" },
      {
        list: [
          "The line-up: adding a coin, changing its pool fee tier or band, switching it off.",
          "The odds table, which must still total 100%.",
          "The fee, capped at 5% by the contract itself, and the stake limits.",
          "The keeper address and the treasury address.",
          "A pause, which stops new purchases and sell-backs - but never reveals or refunds, so packs already paid for still settle.",
        ],
      },
      { heading: "What nobody can change" },
      {
        text: "There is no upgrade mechanism and no admin path to a buyer's ETH. A pack in flight settles under the rules it was bought under, and if the rules change mid-flight the worst case is a refund.",
      },
      {
        note: "The contract has not been audited. Read the source before sending it money; the stake ceiling exists because that advice is not rhetorical.",
      },
    ],
  },
  {
    slug: "addresses",
    title: "Addresses",
    description: "Chain, router, quoter and the ten memecoin contracts.",
    lead: "Verify every one of these on the explorer before you send a transaction to it. On a chain with thousands of daily launches, a wrong address is not a typo.",
    blocks: [
      { heading: "Network" },
      {
        table: {
          head: ["Item", "Value"],
          rows: [
            ["Chain ID", "4663"],
            ["RPC", "https://rpc.mainnet.chain.robinhood.com"],
            ["Explorer", "https://robinhoodchain.blockscout.com"],
            ["Gas token", "ETH"],
          ],
        },
      },
      { heading: "Uniswap v3" },
      {
        table: {
          head: ["Contract", "Address"],
          rows: [
            ["SwapRouter02", "0xcaf681a66d020601342297493863e78c959e5cb2"],
            ["QuoterV2", "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7"],
            ["UniswapV3Factory", "0x1f7d7550b1b028f7571e69a784071f0205fd2efa"],
          ],
        },
      },
      {
        text: "Shellr routes through SwapRouter02 rather than the UniversalRouter. There are reports that the UniversalRouter deployed here is a modified fork whose calldata does not match the stock SDK, and plain exactInputSingle does everything a pack needs without that question hanging over it.",
      },
      { heading: "The coins" },
      {
        table: {
          head: ["Ticker", "Address"],
          rows: [
            ["PONS", "0x39dbed3a2bd333467115de45665cc57f813c4571"],
            ["CASHCAT", "0x020bfc650a365f8bb26819deaabf3e21291018b4"],
            ["AI", "0x2e8c31162b855a2ffa90f6f8634643ad6f111e18"],
            ["NET", "0xca9c78dd337a67f6e0077f65f5e9218719d30edf"],
            ["HMM", "0x7fe995a80075df3dc8ae11a9b82c7fe4202cd87f"],
            ["TENDIES", "0x45242320dbb855eea8fd36804c6487e10e97fcf9"],
            ["MICRODUCK", "0xd5f1afea47b1a9eab414d2ee740cf1d6d039e725"],
            ["DELTA", "0xe8ffd7e24187f72afb08d75b1bb13088a989a791"],
            ["JUGGERNAUT", "0xd7321801caae694090694ff55a9323139f043b88"],
            ["HOOKR", "0x18e674231a58c239dc7daedcffe15ec3a24cff5c"],
          ],
        },
      },
      {
        note: "ShellrPacks is at 0xe442c40cd9e99a9d37f9a364794bc8959c2d4ebe on Robinhood Chain. That is the pack contract. The token is 0x77a719b0f3e7072fc80ed5d67f9aaa580b245462, launched on Pons - anything else presenting itself as $SHELLR is not ours.",
      },
    ],
  },
  {
    slug: "faq",
    title: "Questions",
    description: "The things people ask before their first pack.",
    lead: "Short answers. The long ones are elsewhere in these docs.",
    blocks: [
      {
        text: "Can a pack pay ten times what it cost? No. The best band is a little over 1.7x, and it comes up in one pack in a hundred. Two things are random: how much of your stake the pack spends, and which coins it spends it on.",
      },
      {
        text: "Do I have to sign twice? No. You sign the purchase; the keeper pays for and sends the reveal.",
      },
      {
        text: "What if the keeper never reveals my pack? After ten minutes you call refund yourself and get everything back, the fee included.",
      },
      {
        text: "Can you see what a pack will draw before I buy? No. The seed is fixed by a commitment made before your purchase and combined with a seed you supply. Predicting it would mean holding the master secret, which is the one thing that must never leak.",
      },
      {
        text: "Why does the same stake give a different number of coins each time? The count is the stake divided by a slice size, wobbled a quarter either way by the draw. It is a range, not a promise.",
      },
      {
        text: "What happens if a coin in the line-up collapses? It can still be drawn, and it will be bought at whatever it is worth. If its pool dries up entirely it gets switched off and the draw falls through to the next band.",
      },
      {
        text: "Is there a per-wallet limit? No, but there is a per-pack ceiling of 0.25 ETH while the contract is unaudited.",
      },
    ],
  },
  {
    slug: "risk",
    title: "Risk",
    description: "What can go wrong, stated plainly.",
    lead: "Worth reading before the first pack, not after the tenth.",
    blocks: [
      { heading: "The assets" },
      {
        text: "Memecoins are volatile and thin. Every coin a pack can draw is capable of losing most of its value in an hour, and several of them will. A pack that returned exactly what it cost at the moment it settled can be worth a fraction of that by the evening.",
      },
      { heading: "The slippage" },
      {
        text: "Buying is not free even when the fee is small. A slice landing in a shallow pool moves the price against itself, and that cost is real whether or not it is called a fee. Thin pools are the reason a slice is kept small.",
      },
      { heading: "The code" },
      {
        text: "The contract is not audited. It is short, has no dependencies and no upgrade path, and its riskiest surface - the stake it holds between buy and reveal - is capped and refundable. That is mitigation, not a guarantee.",
      },
      { heading: "The operator" },
      {
        text: "The keeper is a single service holding a hot key and the master secret. If it goes down, packs stop settling and refunds start. If the master secret leaks, packs stay honest but become predictable to whoever holds it.",
      },
      {
        note: "Spend only what you are willing to lose entirely. If opening packs has stopped feeling like a game, that is the signal to stop.",
      },
    ],
  },
  {
    slug: "roadmap",
    title: "Roadmap",
    description:
      "What is built, what is being deployed, and what is still a drawing.",
    lead: "In order. Nothing below moves until the thing above it is done, because each one depends on the last.",
    blocks: [
      { heading: "Done" },
      {
        list: [
          "The room, the pack carousel and the Pons Pack sheet - the whole flow, walkable, running the draw in the browser.",
          "ShellrPacks: buy, commit-reveal, swap, refund, sell-back. Compiled, and its draw verified against the keeper's by executing the bytecode.",
          "The keeper: seed commitment, draw mirror, quoting, reveal. Pinned to the contract by shared test vectors.",
        ],
      },
      { heading: "Next - and blocking" },
      {
        list: [
          "Pool discovery. Buy-at-open needs a Uniswap v3 pool against WETH for every coin in the line-up, at a known fee tier and with real depth. Any coin without one cannot be in a pack.",
          "Deploy to mainnet, verify the source on the explorer, and configure the line-up from what pool discovery found.",
          "Wire the site to the deployed contract: wallet connect, the real buy, and the sheet's numbers read from the chain instead of from a local table.",
          "First packs at the minimum stake, watched end to end, before the ceiling moves at all.",
        ],
      },
      { heading: "After that" },
      {
        list: [
          "An audit, and only then a stake ceiling worth having.",
          "The five fixed tiers on-chain, following the Pons Pack rather than leading it.",
          "A public verifier page: paste a pack ID, get the commitment, the secret, the recomputed draw and the delivered coins side by side.",
          "A second keeper, so a single process being down stops being the most likely failure.",
        ],
      },
      { heading: "Still drawings" },
      {
        text: "The launchpad, pack battles, staking, borrowing and the $SHELLR token all have pages in this sidebar so the intent is public, and each says plainly that nothing is running. They are last for a reason: none of them is worth building before packs work on-chain and have been audited.",
      },
      {
        note: "This page is a plan, not a commitment to dates. Items move down it more often than up.",
      },
    ],
  },
  {
    slug: "launchpad",
    title: "Launchpad",
    soon: true,
    description: "Launching a meme on Pons with a Shellr pack attached to it. Not live yet.",
    lead: "Launch a coin on Pons and give it a pack on the same day. Designed, not built - none of what follows is running.",
    blocks: [
      { heading: "The shape of it" },
      {
        list: [
          "Launch through Pons as normal - Shellr does not replace the launchpad, it hangs off it.",
          "Attach a pack to the launch: the coin becomes drawable, in its own pack or in an existing tier.",
          "The creator sets the pack's price and how much of the supply it can hand out.",
          "Everything else stays as it is - the draw is committed on-chain and the odds are published, whoever the coin belongs to.",
        ],
      },
      { heading: "Why it is not first" },
      {
        text: "A pack that can hold any coin is a pack that can hold a coin with no liquidity, no history and one holder. Buy-at-open turns that into a swap that fills at a price nobody wants. The rules that keep a stranger's coin out of a stranger's pack are the hard part, and they are not written.",
      },
      {
        note: "Nothing here is live. There is no launchpad integration, and Shellr cannot attach a pack to a coin today.",
      },
    ],
  },
  {
    slug: "battles",
    title: "Pack Battles",
    short: "Pack Battles",
    soon: true,
    description: "Opening packs against another player, biggest total wins. Not live yet.",
    lead: "Pick a pack, or several, and open them against somebody else. Designed, not built - none of what follows is running.",
    blocks: [
      { heading: "The shape of it" },
      {
        list: [
          "Both sides put up the same packs and open them in the same rounds.",
          "Every round is drawn under the rules on Provable fairness - a battle is packs, not a separate game with its own odds.",
          "The biggest total across all rounds takes both sides' pulls.",
          "Nobody holds the coins in the meantime: they are delivered when the battle settles, in one transaction.",
        ],
      },
      { heading: "What has to be solved first" },
      {
        text: "A battle is two purchases that have to settle together, and the loser has to have agreed to that before either pack was opened. That is a different contract from the one that sells a pack to one buyer, and it is the part that decides whether a player can walk away mid-battle with their own pull.",
      },
      {
        note: "Nothing here is live. There is no battle contract and no way to challenge anyone.",
      },
    ],
  },
  {
    slug: "staking",
    title: "Staking",
    soon: true,
    description: "Staking kept memecoins for a share of pack fees. Not live yet.",
    lead: "Lock a holding, earn a share of what the packs take. Designed, not built - none of what follows is running.",
    blocks: [
      { heading: "The shape of it" },
      {
        list: [
          "Stake any coin a pack can drop; the position stays yours and can be withdrawn.",
          "Rewards come out of pack fees rather than from minting new supply, so the yield is whatever the packs actually earn that week.",
          "A rarity weight, so staking a mythic is worth more than staking the same value in commons.",
          "A cooldown on withdrawal, long enough that the pool is not farmed for one epoch and abandoned.",
        ],
      },
      { heading: "What is not decided" },
      {
        text: "The fee share, the weights and the cooldown are all open. Publishing a number before it can be honoured is worse than publishing nothing, so this page carries none.",
      },
      {
        note: "Nothing here is live. There is no staking contract, no pool and no way to deposit - if you find something that says otherwise, it is not us.",
      },
    ],
  },
  {
    slug: "borrow",
    title: "Borrow",
    soon: true,
    description: "Borrowing ETH against a holding. Not live yet.",
    lead: "Take ETH against a holding without selling it. Designed, not built - none of what follows is running.",
    blocks: [
      { heading: "The shape of it" },
      {
        list: [
          "Post a holding as collateral and draw ETH against a fraction of its value.",
          "A conservative loan-to-value, set per band - memecoin depth is thin and a common cannot support what a mythic can.",
          "Liquidation if the collateral falls through its threshold, with the position sold to cover the loan.",
          "Repay at any time and the collateral comes back untouched.",
        ],
      },
      { heading: "Why this is the hard one" },
      {
        text: "Lending against memecoins is a pricing problem before it is a contract problem: the collateral can lose most of its value in an hour, and a liquidation that cannot find a bid is a bad debt rather than a sale. This ships last, and only with a route deep enough to clear a position at size.",
      },
      {
        note: "Nothing here is live. There is no lending contract and no way to borrow.",
      },
    ],
  },
  {
    slug: "token",
    title: "$SHELLR",
    soon: true,
    description: "The Shellr token. Not deployed.",
    lead: "A token is planned. It is not deployed, there is no address, and there is no sale.",
    blocks: [
      {
        text: "What it is meant to do: discount the fee for holders, weight staking rewards, and eventually govern the line-up - which coins are packable and on what terms.",
      },
      {
        note: "There is no $SHELLR contract. Any address, presale, allocation or claim you are shown for it is a scam, including one that arrives from an account that looks like ours.",
      },
    ],
  },
];

export const docsPage = (slug: string): DocsPage | undefined =>
  DOCS_PAGES.find((page) => page.slug === slug);

export const docsLabel = (page: DocsPage): string => page.short ?? page.title;

/** An anchor for a sub-heading — what the right-hand contents links to. */
export const headingId = (heading: string): string =>
  heading
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/** The sub-headings on a page, in order. */
export const pageHeadings = (page: DocsPage): string[] =>
  page.blocks.flatMap((block) => (block.heading ? [block.heading] : []));
