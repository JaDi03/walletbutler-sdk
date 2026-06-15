import { NextResponse } from "next/server";
import { buildRedelegationChain } from "../../../../src/lib/redelegation";
import { executeVia1ShotRelayer } from "../../../../src/lib/oneshot";
import { encodeFunctionData, parseUnits } from "viem";

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

export async function POST(req: Request) {
  try {
    const { rootDelegation, intent, recipient, chainId } = await req.json();

    if (!rootDelegation || !intent || !recipient || !chainId) {
      return NextResponse.json({ error: "Missing required parameters" }, { status: 400 });
    }

    const intentAmount = intent.amount;

    const privateKey = process.env.AGENT_CHAT_PRIVATE_KEY;
    if (!privateKey) throw new Error("AGENT_CHAT_PRIVATE_KEY missing in backend");

    // rootDelegation comes from frontend as the full context object. 
    // We need to extract the actual array of delegations (rootDelegation.delegation).
    let actualDelegationArray;
    if (rootDelegation && typeof rootDelegation === 'object' && 'delegation' in rootDelegation) {
      actualDelegationArray = rootDelegation.delegation;
    } else if (Array.isArray(rootDelegation)) {
      actualDelegationArray = rootDelegation;
    } else {
      actualDelegationArray = [rootDelegation];
    }

    const buildChainCb = async (feeAmount: bigint) => {
      // buildRedelegationChain signature: (rootDelegations: any[], chainId: number, transferAmountFormatted: string, requiredFeeAmount: bigint)
      return await buildRedelegationChain(actualDelegationArray, chainId, intentAmount.toString(), feeAmount);
    };

    let workExecutions: { target: string; value: string; data: string }[] = [];

    const usdcAddress = chainId === 8453 ? USDC_BASE_MAINNET : USDC_BASE_SEPOLIA;

    if (intent.action === "prepare_usdc_transfer" || intent.action === "send_usdc_transaction") {
      workExecutions = [{
        target: usdcAddress,
        value: "0",
        data: encodeFunctionData({
          abi: ERC20_ABI,
          functionName: "transfer",
          args: [recipient as `0x${string}`, parseUnits(intentAmount.toString(), 6)],
        }),
      }];
    } else {
      throw new Error(`Unsupported intent action: ${intent.action}`);
    }

    const taskId = await executeVia1ShotRelayer(
      chainId,
      buildChainCb,
      workExecutions
    );

    return NextResponse.json({ success: true, taskId });
  } catch (error: any) {
    console.error("[Relayer API Error]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
