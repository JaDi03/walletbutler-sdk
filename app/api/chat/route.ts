import { NextResponse } from "next/server";
import { testAgentUnderstanding } from "../../../src/venice";

export async function POST(req: Request) {
  try {
    const { messages, chainId, networkName, hasDelegation, userAddress } = await req.json();
    const logs: string[] = [];

    // Call the agent logic with the full chat history
    const { content, capturedLogs, balanceUsd, balanceDiem, x402BalanceUsd, x402DiemBalanceUsd, intent } = await testAgentUnderstanding(messages, logs, chainId, networkName, hasDelegation, userAddress);

    return NextResponse.json({ response: content, logs: capturedLogs, balanceUsd, balanceDiem, x402BalanceUsd, x402DiemBalanceUsd, intent });
  } catch (error: any) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
