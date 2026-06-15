/* eslint-disable @typescript-eslint/ban-ts-comment */
// @ts-nocheck
// NOTE: This file uses @metamask/smart-accounts-kit which has a type-level
// conflict with the root viem version. This directive suppresses incompatible type
// declarations from the bundled ox/viem inside smart-accounts-kit.

import { toMetaMaskSmartAccount, Implementation, createDelegation, ScopeType } from "@metamask/smart-accounts-kit";
import { parseUnits, createPublicClient, http, bytesToHex } from "viem";
import { randomBytes } from "crypto";
import { base, baseSepolia } from "viem/chains";
import { privateKeyToAccount } from "viem/accounts";

const RELAYER_TARGET_SEPOLIA = "0xf1ef956eff4181Ce913b664713515996858B9Ca9" as `0x${string}`;
const RELAYER_TARGET_MAINNET = "0x26a529124f0bbf9af9d8f9f84a43efe47cf1199a" as `0x${string}`;
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`;
const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;

function getChatAgentAccount() {
  const privateKey = process.env.AGENT_CHAT_PRIVATE_KEY;
  if (!privateKey) throw new Error("Missing AGENT_CHAT_PRIVATE_KEY");
  const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  return privateKeyToAccount(formattedKey as `0x${string}`);
}

function generateSalt(): `0x${string}` {
  return bytesToHex(Uint8Array.from(randomBytes(32)));
}

function toRelayerJson(value: unknown): unknown {
  if (value === null || value === undefined) return value;
  if (typeof value === "bigint") return `0x${value.toString(16)}`;
  if (value instanceof Uint8Array) return bytesToHex(value);
  if (Array.isArray(value)) return value.map(toRelayerJson);
  if (typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = toRelayerJson(v);
    return out;
  }
  return value;
}

/**
 * Builds the Just-In-Time (JIT) redelegation chain
 * 1. Root: User -> Chat Agent (received from frontend)
 * 2. Redelegation 1: Chat Agent -> 1Shot Relayer (JIT exact amount)
 */
export async function buildRedelegationChain(
  rootDelegations: any[],
  chainId: number,
  transferAmountFormatted: string,
  requiredFeeAmount: bigint
): Promise<any[]> {
  const chain = chainId === 8453 ? base : baseSepolia;
  const usdcAddress = chainId === 8453 ? USDC_BASE_MAINNET : USDC_BASE_SEPOLIA;
  const relayerTarget = chainId === 8453 ? RELAYER_TARGET_MAINNET : RELAYER_TARGET_SEPOLIA;
  const rpcUrl = chainId === 8453 
    ? process.env.RPC_URL_BASE_MAINNET || "https://mainnet.base.org"
    : process.env.RPC_URL_BASE_SEPOLIA || "https://sepolia.base.org";

  const publicClient = createPublicClient({
    chain,
    transport: http(rpcUrl),
  });

  const chatAccount = getChatAgentAccount();

  // Cast to any: resolves type conflict between root viem and the viem
  // bundled inside @metamask/smart-accounts-kit.
  const chatSmartAccount = await toMetaMaskSmartAccount({
    client: publicClient as any,
    implementation: Implementation.Stateless7702,
    address: chatAccount.address,
    signer: { account: chatAccount },
  });

  const rootDelegation = rootDelegations[0];
  if (!rootDelegation) throw new Error("No root delegation provided from Frontend");

  // Calculate JIT exact amount (Transfer + Estimated relayer gas fee)
  const transferAmount = parseUnits(transferAmountFormatted, 6);
  const exactMaxAmount = transferAmount + requiredFeeAmount;

  console.log(`[Redelegation] Building JIT chain for exact amount: ${exactMaxAmount} atoms on chain ${chainId}`);

  // ==========================================
  // Redelegation 1: Chat Agent -> 1Shot Relayer
  // ==========================================
  const redelegationUnsigned = createDelegation({
    scope: {
      type: ScopeType.Erc20TransferAmount,
      tokenAddress: usdcAddress,
      maxAmount: exactMaxAmount
    },
    to: relayerTarget,
    from: chatAccount.address,
    parentDelegation: rootDelegation,
    environment: chatSmartAccount.environment,
    salt: generateSalt(),
  });

  const sig = await chatSmartAccount.signDelegation({ delegation: redelegationUnsigned });
  const redelegation = { ...redelegationUnsigned, signature: sig };

  // Return the exact array that 1Shot requires: reversed order [Redel, Root]
  return [
    toRelayerJson(redelegation),
    rootDelegation
  ];
}
