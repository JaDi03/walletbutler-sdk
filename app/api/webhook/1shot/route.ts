import { NextResponse } from "next/server";
import crypto from "crypto";
import stringify from "safe-stable-stringify";

type Jwk = { kty: "OKP"; crv: "Ed25519"; kid: string; x: string };
type Jwks = { keys: Jwk[] };

let jwksCacheDev: { fetchedAt: number; keys: Map<string, crypto.KeyObject> } | null = null;
let jwksCacheCom: { fetchedAt: number; keys: Map<string, crypto.KeyObject> } | null = null;
const JWKS_TTL_MS = 10 * 60_000; // 10 minutes

async function getJwks(isTestnet: boolean, force = false): Promise<Map<string, crypto.KeyObject>> {
  const cache = isTestnet ? jwksCacheDev : jwksCacheCom;
  if (!force && cache && Date.now() - cache.fetchedAt < JWKS_TTL_MS) {
    return cache.keys;
  }
  
  const url = isTestnet 
    ? "https://relayer.1shotapi.dev/.well-known/jwks.json"
    : "https://relayer.1shotapi.com/.well-known/jwks.json";

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
    const { keys } = (await res.json()) as Jwks;
    const map = new Map<string, crypto.KeyObject>();
    for (const k of keys) {
      if (k.kty === "OKP" && k.crv === "Ed25519") {
        const pubKey = crypto.createPublicKey({
          key: { kty: k.kty, crv: k.crv, x: k.x },
          format: "jwk"
        });
        map.set(k.kid, pubKey);
      }
    }
    
    if (isTestnet) jwksCacheDev = { fetchedAt: Date.now(), keys: map };
    else jwksCacheCom = { fetchedAt: Date.now(), keys: map };
    
    return map;
  } catch (err: any) {
    console.error("[1shot-webhook] Error fetching JWKS:", err.message);
    throw err;
  }
}

async function verifyRelayerWebhook(body: Record<string, unknown>): Promise<boolean> {
  const sigB64 = body.signature as string | undefined;
  const keyId = body.keyId as string | undefined;
  if (!sigB64 || !keyId) return false;

  const data = body.data as any;
  const isTestnet = data?.chainId === "11155111" || data?.chainId === "84532";

  let keys = await getJwks(isTestnet);
  let pub = keys.get(keyId);
  if (!pub) {
    keys = await getJwks(isTestnet, true); // force refresh on miss
    pub = keys.get(keyId);
    if (!pub) return false;
  }

  const { signature: _omit, ...rest } = body; 
  const messageStr = stringify(rest) as string;
  const message = Buffer.from(messageStr);
  const sig = Buffer.from(sigB64, "base64");
  
  try {
    return crypto.verify(null, message, pub, sig);
  } catch (err: any) {
    console.error("[1shot-webhook] crypto.verify error:", err.message);
    return false;
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    const isValid = await verifyRelayerWebhook(body);
    if (!isValid) {
      console.warn("[1shot-webhook] ❌ Invalid signature or missing keys.");
      return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
    }

    const type = body.type; // 4: Submitted, 0: Confirmed, 1: Reverted
    const data = body.data as { id: string; status: number; memo?: string; hash?: string; receipt?: any };

    console.log(`[1shot-webhook] ✅ Verified event! Type: ${type}, TaskId: ${data?.id}, Memo: ${data?.memo}`);
    
    // Dynamically import store to avoid global conflicts in some environments
    const { webhookStore } = await import("../../../../src/lib/store");

    if (type === 0 || (type === 4 && data?.status === 200)) { // type 0 is task completed, or type 4 with status 200
      const txHash = data?.receipt?.transactionHash || data?.hash;
      console.log(`[1shot-webhook] 🎉 Task ${data?.id} CONFIRMED! Hash: ${txHash}`);
      if (data?.id && txHash) webhookStore.set(data.id, txHash);
    } else if (type === 1 || data?.status >= 400) {
      console.error(`[1shot-webhook] ❌ Task ${data?.id} FAILED/REVERTED!`);
      if (data?.id) webhookStore.set(data.id, "failed");
    } else if (type === 4) {
      console.log(`[1shot-webhook] ⏳ Task ${data?.id} SUBMITTED to mempool. Hash: ${data?.hash}`);
    }

    return NextResponse.json({ received: true });
  } catch (error: any) {
    console.error("[1shot-webhook] ❌ Server error processing webhook:", error.message);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
