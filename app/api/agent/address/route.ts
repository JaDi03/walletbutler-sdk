import { NextResponse } from "next/server";
import { privateKeyToAccount } from "viem/accounts";

export async function GET() {
  try {
    const privateKey = process.env.AGENT_CHAT_PRIVATE_KEY;
    if (!privateKey) {
      return NextResponse.json({ success: false, error: "Missing AGENT_CHAT_PRIVATE_KEY" }, { status: 500 });
    }
    
    const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    const account = privateKeyToAccount(formattedKey as `0x${string}`);
    
    return NextResponse.json({ success: true, address: account.address });
  } catch (error: any) {
    console.error("Error generating agent address:", error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
