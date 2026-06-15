import { NextResponse } from "next/server";
import { webhookStore } from "../../../../src/lib/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const taskId = searchParams.get("taskId");

  if (!taskId) {
    return NextResponse.json({ error: "Missing taskId" }, { status: 400 });
  }

  const txHash = webhookStore.get(taskId);

  if (txHash) {
    if (txHash === "failed") {
      return NextResponse.json({ status: "failed" });
    }
    return NextResponse.json({ status: "confirmed", txHash });
  }

  return NextResponse.json({ status: "pending" });
}
