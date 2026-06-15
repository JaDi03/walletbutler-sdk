import { createWalletClient, custom, parseUnits } from "viem";
import { base, baseSepolia } from "viem/chains";
import { bytesToHex } from "viem/utils";
import { erc7715ProviderActions } from "@metamask/smart-accounts-kit/actions";
import { decodeDelegations } from "@metamask/smart-accounts-kit/utils";

// Token and network definitions
const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`;
const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`; // Standard USDC on Base
const USDC_DECIMALS = 6;

/**
 * Convert delegation bigints / Uint8Arrays into JSON-safe shapes.
 */
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
 * Grants the Wallet Butler Agent a scoped delegation to act on behalf of the user's EOA.
 * Uses @metamask/smart-accounts-kit with EIP-7715 (wallet_requestExecutionPermissions).
 */
export async function grantAgentPermissions(
  spendLimit: number,
  expiryDays: number,
  chainId: number
) {
  if (!(window as any).ethereum) throw new Error("MetaMask is not installed.");

  // Get the connected user's address
  const accounts = await (window as any).ethereum.request({
    method: "eth_accounts",
  });
  const userAddress = accounts?.[0] as `0x${string}` | undefined;
  if (!userAddress) throw new Error("No wallet connected.");

  const chain = chainId === 8453 ? base : baseSepolia;
  const usdcAddress = chainId === 8453 ? USDC_BASE_MAINNET : USDC_BASE_SEPOLIA;
  
  // Create wallet client and extend with EIP-7715 actions
  const walletClient = createWalletClient({
    account: userAddress,
    chain,
    transport: custom((window as any).ethereum),
  });
  const wallet7715 = walletClient.extend(erc7715ProviderActions());

  console.log(`[delegation] Fetching Chat Agent address from backend...`);
  const res = await fetch("/api/agent/address");
  const data = await res.json();
  if (!data.success || !data.address) throw new Error("Failed to fetch Chat Agent address");
  const chatAgentAddress = data.address as `0x${string}`;

  console.log(`[delegation] Chat Agent (Root Delegatee): ${chatAgentAddress}`);
  console.log(`[delegation] User EOA: ${userAddress}`);
  console.log(`[delegation] Requesting EIP-7715 execution permissions...`);

  const maxAmount = parseUnits(spendLimit.toString(), USDC_DECIMALS);
  const expiryTimestamp = Math.floor(Date.now() / 1000) + (expiryDays * 86400);

  // Request permission from the extension
  const granted = await wallet7715.requestExecutionPermissions([
    {
      chainId: chain.id,
      to: chatAgentAddress,
      permission: {
        type: "erc20-token-periodic",
        data: {
          tokenAddress: usdcAddress,
          periodAmount: maxAmount,
          periodDuration: expiryDays * 86400,
          justification: "Allow Wallet Butler to execute automated transfers via 1Shot Relayer",
        },
        isAdjustmentAllowed: true,
      },
      expiry: expiryTimestamp,
    },
  ]);

  const context = granted[0]?.context;
  if (!context) throw new Error("No permission context returned by wallet");

  // Decode the context into a delegations array and serialize it
  const delegations = decodeDelegations(context).map((d) => toRelayerJson(d));
  
  console.log("[delegation] Delegation granted and serialized!", delegations);

  return {
    grantedAt: Date.now(),
    spendLimit,
    expiryDays,
    chainId,
    userAddress,
    delegation: delegations,
    authorizationList: undefined, 
  };
}
