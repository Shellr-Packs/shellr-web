"use client";

import type { Address, Hash } from "viem";

import { erc20Abi, robinhood } from "@/lib/chain/config";
import { confirmTx, publicClient, useWallet } from "@/lib/chain/wallet";

/**
 * Staking: stake $SHELLR, earn WETH.
 *
 * The rewards are not minted. Somebody funds the contract and the contract
 * pays that out over a period — so the honest thing for the page above this to
 * show is the size of the pot and when the period ends, not an APR conjured
 * from an emission schedule that does not exist.
 */

/**
 * The deployed staking contract.
 *
 * Written here rather than left to an environment variable, for the same
 * reason as the packs address: the site is deployed from a shell prompt, and a
 * build that quietly decides staking is not live because a variable did not
 * reach the host is the worst of the failure modes.
 */
const DEPLOYED = "0xeE341fb06627C650e45552FfCe5159E7D19e2506";

const configured = process.env.NEXT_PUBLIC_STAKING_ADDRESS ?? DEPLOYED;

export const STAKING_ADDRESS: Address | null = /^0x[0-9a-fA-F]{40}$/.test(
  configured,
)
  ? (configured as Address)
  : null;

/**
 * Checksummed, deliberately.
 *
 * A lowercase address is legal and most tooling accepts it - and then one
 * library in the chain decides it is not, refuses the call, and the failure
 * surfaces as a balance of zero rather than as an error. That is a whole
 * evening lost to "the wallet shows nothing", and it has happened before.
 */
export const SHELLR_TOKEN =
  "0x77A719B0F3E7072FC80eD5D67f9aAA580b245462" as Address;
export const WETH = "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73" as Address;

export const stakingLive = STAKING_ADDRESS !== null;

export const stakingAbi = [
  {
    type: "function",
    name: "stake",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "withdraw",
    stateMutability: "nonpayable",
    inputs: [{ type: "uint256" }],
    outputs: [],
  },
  {
    type: "function",
    name: "getReward",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "exit",
    stateMutability: "nonpayable",
    inputs: [],
    outputs: [],
  },
  {
    type: "function",
    name: "totalStaked",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
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
    name: "earned",
    stateMutability: "view",
    inputs: [{ type: "address" }],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "rewardRate",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "rewardsDuration",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "periodFinish",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
  {
    type: "function",
    name: "getRewardForDuration",
    stateMutability: "view",
    inputs: [],
    outputs: [{ type: "uint256" }],
  },
] as const;

export interface StakingState {
  totalStaked: bigint;
  myStake: bigint;
  earned: bigint;
  walletBalance: bigint;
  potWei: bigint;
  perPeriodWei: bigint;
  periodEnds: number;
  durationDays: number;
  /** Share of the pool, 0 to 1. Zero when nothing is staked. */
  share: number;
}

const staking = (): Address => {
  if (!STAKING_ADDRESS) throw new Error("Staking is not deployed yet");
  return STAKING_ADDRESS;
};

export const readStaking = async (account?: Address): Promise<StakingState> => {
  const address = staking();
  const read = (functionName: string, args: readonly unknown[] = []) =>
    publicClient.readContract({
      address,
      abi: stakingAbi,
      functionName,
      args,
    } as never) as Promise<bigint>;

  const [totalStaked, perPeriodWei, periodFinish, duration, potWei] =
    await Promise.all([
      read("totalStaked"),
      read("getRewardForDuration"),
      read("periodFinish"),
      read("rewardsDuration"),
      publicClient.readContract({
        address: WETH,
        abi: erc20Abi,
        functionName: "balanceOf",
        args: [address],
      }) as Promise<bigint>,
    ]);

  const [myStake, earned, walletBalance] = account
    ? await Promise.all([
        read("balanceOf", [account]),
        read("earned", [account]),
        publicClient.readContract({
          address: SHELLR_TOKEN,
          abi: erc20Abi,
          functionName: "balanceOf",
          args: [account],
        }) as Promise<bigint>,
      ])
    : [0n, 0n, 0n];

  return {
    totalStaked,
    myStake,
    earned,
    walletBalance,
    potWei,
    perPeriodWei,
    periodEnds: Number(periodFinish) * 1000,
    durationDays: Number(duration) / 86400,
    share:
      totalStaked > 0n ? Number((myStake * 10000n) / totalStaked) / 10000 : 0,
  };
};

/** Stake, approving first when the allowance is short. */
export const stakeShellr = async (amount: bigint): Promise<Hash> => {
  const wallet = useWallet.getState().walletClient();
  const owner = useWallet.getState().address;
  if (!wallet || !owner) throw new Error("Connect a wallet first");

  const allowance = (await publicClient.readContract({
    address: SHELLR_TOKEN,
    abi: erc20Abi,
    functionName: "allowance",
    args: [owner, staking()],
  })) as bigint;

  if (allowance < amount) {
    const approval = await wallet.writeContract({
      address: SHELLR_TOKEN,
      abi: erc20Abi,
      functionName: "approve",
      args: [staking(), amount],
      chain: robinhood,
      account: wallet.account!,
    });
    await confirmTx(approval, "The approval");
  }

  const hash = await wallet.writeContract({
    address: staking(),
    abi: stakingAbi,
    functionName: "stake",
    args: [amount],
    chain: robinhood,
    account: wallet.account!,
  });
  await confirmTx(hash, "The transaction");
  return hash;
};

const write = async (
  functionName: "withdraw" | "getReward" | "exit",
  args: readonly unknown[] = [],
): Promise<Hash> => {
  const wallet = useWallet.getState().walletClient();
  if (!wallet) throw new Error("Connect a wallet first");
  const hash = await wallet.writeContract({
    address: staking(),
    abi: stakingAbi,
    functionName,
    args,
    chain: robinhood,
    account: wallet.account!,
  } as never);
  await confirmTx(hash, "The transaction");
  return hash;
};

export const unstakeShellr = (amount: bigint) => write("withdraw", [amount]);
export const claimRewards = () => write("getReward");
export const exitStaking = () => write("exit");
