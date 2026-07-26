import { defineChain } from "viem";

/**
 * Robinhood Chain, and the one address that decides whether this site is a
 * demonstration or a shop.
 *
 * `NEXT_PUBLIC_PACKS_ADDRESS` is unset until `ShellrPacks` is deployed, and
 * everything downstream reads `isLive` rather than testing for the variable
 * itself — so the day it is set, the wallet button, the buy and the vault all
 * switch over together, and until then the browser roll keeps working.
 */

export const robinhood = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: {
      http: [
        process.env.NEXT_PUBLIC_RPC_URL ??
          "https://rpc.mainnet.chain.robinhood.com",
      ],
    },
  },
  blockExplorers: {
    default: {
      name: "Blockscout",
      url: "https://robinhoodchain.blockscout.com",
    },
  },
});

/**
 * The deployed contract.
 *
 * Written here rather than left to an environment variable: the address is
 * public the moment it exists, the site is deployed by dragging a folder at a
 * shell prompt, and a build that silently falls back to the browser roll
 * because a variable did not reach the host is the worst of the failure modes.
 * The variable still wins where it is set, for a testnet copy.
 */
const DEPLOYED = "0xe442c40cD9e99a9D37f9a364794bC8959c2D4ebe";

const configured = process.env.NEXT_PUBLIC_PACKS_ADDRESS ?? DEPLOYED;

/** The deployed contract, or `null` while there is not one. */
export const PACKS_ADDRESS: `0x${string}` | null =
  /^0x[0-9a-fA-F]{40}$/.test(configured) ? (configured as `0x${string}`) : null;

/** Whether packs are bought on-chain or rolled in the browser. */
export const isLive = PACKS_ADDRESS !== null;

export const explorerTx = (hash: string): string =>
  `${robinhood.blockExplorers.default.url}/tx/${hash}`;

/** Only what the site calls. The full ABI lives with the contract. */
export const packsAbi = [
  {
    type: "function",
    name: "buy",
    stateMutability: "payable",
    inputs: [{ name: "clientSeed", type: "bytes32" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "buyWithToken",
    stateMutability: "nonpayable",
    inputs: [
      { name: "clientSeed", type: "bytes32" },
      { name: "stakeWei", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenCost",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenBudgetLeft",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "tokenSales",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "payToken",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
  {
    type: "function",
    name: "tokenDiscountBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    type: "event",
    name: "PackBoughtWithToken",
    inputs: [
      { name: "packId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "stake", type: "uint256", indexed: false },
      { name: "tokenPaid", type: "uint256", indexed: false },
      { name: "seedIndex", type: "uint64", indexed: false },
      { name: "clientSeed", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "function",
    name: "createCommunityPack",
    stateMutability: "nonpayable",
    inputs: [
      { name: "name", type: "string" },
      { name: "priceWei", type: "uint96" },
      { name: "coins", type: "address[]" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "retireCommunityPack",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "votePack",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }, { type: "bool" }],
    outputs: [],
  },
  {
    type: "function",
    name: "packLikes",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "function",
    name: "packDislikes",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [{ type: "uint32" }],
  },
  {
    type: "function",
    name: "packVote",
    stateMutability: "view",
    inputs: [{ type: "uint256" }, { type: "address" }],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "communityPackCount",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "communityPack",
    stateMutability: "view",
    inputs: [{ type: "uint256" }],
    outputs: [
      { name: "builder", type: "address" },
      { name: "priceWei", type: "uint96" },
      { name: "name", type: "string" },
      { name: "coins", type: "address[]" },
      { name: "live", type: "bool" },
    ],
  },
  {
    type: "function",
    name: "refund",
    stateMutability: "nonpayable",
    inputs: [{ name: "packId", type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "sellBack",
    stateMutability: "nonpayable",
    inputs: [
      { name: "token", type: "address" },
      { name: "poolFee", type: "uint24" },
      { name: "amount", type: "uint256" },
      { name: "minOut", type: "uint256" },
    ],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "minStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "maxStake",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "feeBps",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint16" }],
  },
  {
    type: "function",
    name: "paused",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "bool" }],
  },
  {
    type: "function",
    name: "seedsLeft",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "allCoins",
    stateMutability: "view",
    inputs: [],
    outputs: [
      {
        type: "tuple[]",
        components: [
          { name: "token", type: "address" },
          { name: "poolFee", type: "uint24" },
          { name: "band", type: "uint8" },
          { name: "live", type: "bool" },
        ],
      },
    ],
  },
  {
    type: "event",
    name: "PackBought",
    inputs: [
      { name: "packId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "paid", type: "uint256", indexed: false },
      { name: "seedIndex", type: "uint64", indexed: false },
      { name: "clientSeed", type: "bytes32", indexed: false },
    ],
  },
  {
    type: "event",
    name: "PackOpened",
    inputs: [
      { name: "packId", type: "uint256", indexed: true },
      { name: "buyer", type: "address", indexed: true },
      { name: "secret", type: "bytes32", indexed: false },
      { name: "stake", type: "uint256", indexed: false },
      { name: "fee", type: "uint256", indexed: false },
      { name: "count", type: "uint8", indexed: false },
      // Added with the payout multiplier. **Both halves have to know**: an
      // event signature is part of its topic hash, so a stale copy here does
      // not mismatch loudly - it simply never matches, and the sheet waits
      // forever for a reveal that already happened.
      { name: "payoutBps_", type: "uint16", indexed: false },
      { name: "spend", type: "uint256", indexed: false },
    ],
  },
  {
    type: "event",
    name: "CoinDelivered",
    inputs: [
      { name: "packId", type: "uint256", indexed: true },
      { name: "token", type: "address", indexed: true },
      { name: "spent", type: "uint256", indexed: false },
      { name: "received", type: "uint256", indexed: false },
    ],
  },
] as const;

/** Uniswap's quoter on this chain, for pricing a sell before sending it. */
export const QUOTER_ADDRESS =
  "0x33e885ed0ec9bf04ecfb19341582aadcb4c8a9e7" as `0x${string}`;

export const quoterAbi = [
  {
    type: "function",
    name: "quoteExactInputSingle",
    stateMutability: "nonpayable",
    inputs: [
      {
        type: "tuple",
        components: [
          { name: "tokenIn", type: "address" },
          { name: "tokenOut", type: "address" },
          { name: "amountIn", type: "uint256" },
          { name: "fee", type: "uint24" },
          { name: "sqrtPriceLimitX96", type: "uint160" },
        ],
      },
    ],
    outputs: [
      { name: "amountOut", type: "uint256" },
      { name: "sqrtPriceX96After", type: "uint160" },
      { name: "initializedTicksCrossed", type: "uint32" },
      { name: "gasEstimate", type: "uint256" },
    ],
  },
] as const;

export const routerAbi = [
  {
    type: "function",
    name: "WETH9",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "address" }],
  },
] as const;

export const ROUTER_ADDRESS =
  "0xcaf681a66d020601342297493863e78c959e5cb2" as `0x${string}`;

export const FACTORY_ADDRESS =
  "0x1f7d7550b1b028f7571e69a784071f0205fd2efa" as `0x${string}`;

export const factoryAbi = [
  {
    type: "function",
    name: "getPool",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }, { type: "uint24" }],
    outputs: [{ type: "address" }],
  },
] as const;

export const poolAbi = [
  {
    type: "function",
    name: "liquidity",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint128" }],
  },
] as const;

export const erc20Abi = [
  {
    type: "function",
    name: "symbol",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "name",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "string" }],
  },
  {
    type: "function",
    name: "balanceOf",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "decimals",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint8" }],
  },
  {
    type: "function",
    name: "allowance",
    stateMutability: "view",
    inputs: [{ type: "address" }, { type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "approve",
    stateMutability: "nonpayable",
    inputs: [{ type: "address" }, { type: "uint256" }],
    outputs: [{ type: "bool" }],
  },
] as const;
