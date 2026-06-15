import { encodeFunctionData, parseUnits } from "viem";

// Standard ERC-20 Transfer ABI
const ERC20_ABI = [
  {
    type: "function",
    name: "transfer",
    inputs: [
      { name: "recipient", type: "address" },
      { name: "amount", type: "uint256" },
    ],
    outputs: [{ name: "", type: "bool" }],
    stateMutability: "nonpayable",
  }
] as const;

const USDC_BASE_SEPOLIA = "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as `0x${string}`;
const USDC_BASE_MAINNET = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" as `0x${string}`;
const FEE_COLLECTOR = "0xE936e8FAf4A5655469182A49a505055B71C17604" as `0x${string}`;

export async function relayerRpc<T>(relayerUrl: string, method: string, params: unknown): Promise<T> {
  const payload = { jsonrpc: "2.0", id: Date.now(), method, params };
  console.log(`[oneshot.rpc] ${method} →`, JSON.stringify(params, null, 2));

  const res = await fetch(relayerUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const json = await res.json();

  if (json.error) {
    throw new Error(`[${json.error.code}] ${json.error.message}`);
  }
  return json.result as T;
}

export function relayerUrlForChain(chainId: number): string {
  return chainId === 84532 || chainId === 11155111
    ? "https://relayer.1shotapi.dev/relayers"
    : "https://relayer.1shotapi.com/relayers";
}

interface Estimate7710Result {
  success: boolean;
  requiredPaymentAmount?: string;
  context?: string;
  gasUsed: Record<string, string>;
  error?: string;
}

export async function executeVia1ShotRelayer(
  chainId: number,
  buildChainCallback: (feeAmount: bigint) => Promise<any[]>,
  workExecutions: { target: string; value: string; data: string }[]
) {
  const relayerUrl = relayerUrlForChain(chainId);

  console.log(`[oneshot] Executing via 1Shot Relayer on chain ${chainId}...`);

  let feeAmount = 10000n; // Initial mock fee (0.01 USDC)
  const usdcAddress = chainId === 8453 ? USDC_BASE_MAINNET : USDC_BASE_SEPOLIA;

  function buildFeeExecution(amount: bigint) {
    return {
      target: usdcAddress,
      value: "0",
      data: encodeFunctionData({
        abi: ERC20_ABI,
        functionName: "transfer",
        args: [FEE_COLLECTOR, amount],
      }),
    };
  }

  function buildSendParams(currentFeeAmount: bigint, chain: any[]) {
    return {
      chainId: chainId.toString(),
      transactions: [
        {
          permissionContext: chain,
          executions: [
            buildFeeExecution(currentFeeAmount),
            ...workExecutions,
          ],
        },
      ],
    };
  }

  // Step 2: Estimate
  console.log("[oneshot] Step 2: Estimating transaction fee...");
  let currentChain = await buildChainCallback(feeAmount);
  let sendParams = buildSendParams(feeAmount, currentChain);

  let estimate = await relayerRpc<Estimate7710Result>(relayerUrl, "relayer_estimate7710Transaction", sendParams);

  if (!estimate.success) {
    throw new Error(`Fee estimation rejected: ${estimate.error}`);
  }

  console.log(`[oneshot] Estimate success! Required fee: ${estimate.requiredPaymentAmount} atoms`);

  // Step 3: Rebuild if fee differs
  const requiredFee = BigInt(estimate.requiredPaymentAmount || "10000");
  if (requiredFee !== feeAmount) {
    console.log(`[oneshot] Adjusting fee from ${feeAmount} to ${requiredFee} atoms...`);
    feeAmount = requiredFee;
    currentChain = await buildChainCallback(feeAmount);
    sendParams = buildSendParams(feeAmount, currentChain);

    estimate = await relayerRpc<Estimate7710Result>(relayerUrl, "relayer_estimate7710Transaction", sendParams);
    if (!estimate.success) throw new Error(`Re-estimation rejected: ${estimate.error}`);
    console.log(`[oneshot] Re-estimate success! Context locked.`);
  }

  // Step 4: Submit
  console.log("[oneshot] Step 4: Submitting transaction...");
  const webhookUrl = process.env.WEBHOOK_URL || "";
  
  const taskId = await relayerRpc<string>(relayerUrl, "relayer_send7710Transaction", {
    ...sendParams,
    context: estimate.context,
    memo: "walletbutler",
    ...(webhookUrl ? { destinationUrl: webhookUrl } : {})
  });

  console.log(`[oneshot] Task submitted! ID: ${taskId}`);

  console.log(`[oneshot] Task submitted! ID: ${taskId}. Waiting for Webhook to process...`);

  // We no longer poll here. The frontend will poll the webhook status directly.
  return taskId;
}
