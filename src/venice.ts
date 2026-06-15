import { privateKeyToAccount } from "viem/accounts";
import { createSiweMessage } from "viem/siwe";
import { randomBytes } from "crypto";
import { createPublicClient, http, parseAbi } from "viem";
import { baseSepolia } from "viem/chains";

const VENICE_API_URL = "https://api.venice.ai/api/v1/chat/completions";
const VENICE_MODELS_URL = "https://api.venice.ai/api/v1/models";
const VENICE_RPC_URL = "https://api.venice.ai/api/v1/crypto/rpc";

/**
 * Generates the x402 authentication header payload using the provided private key.
 */
async function generateX402AuthHeader(privateKey: string): Promise<string> {
  // Ensure the private key has the 0x prefix
  const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
  const account = privateKeyToAccount(formattedKey as `0x${string}`);

  const nonce = randomBytes(8).toString("hex"); // 16-character hex string
  const issuedAt = new Date();
  const domain = "api.venice.ai";
  const uri = "https://api.venice.ai";
  const chainId = 8453; // Arbitrary chainId, e.g. Base

  const message = createSiweMessage({
    domain,
    address: account.address,
    statement: "Sign in to Venice AI",
    uri,
    version: "1",
    chainId,
    nonce,
    issuedAt,
  });

  const signature = await account.signMessage({ message });

  const payload = {
    address: account.address,
    message,
    signature,
    timestamp: Date.now(),
    chainId,
  };

  return Buffer.from(JSON.stringify(payload)).toString("base64");
}

/**
 * Validates the environment and returns the x402 auth header.
 */
async function getAuthHeader(): Promise<string> {
  const privateKey = process.env.AGENT_CHAT_PRIVATE_KEY;
  if (!privateKey) {
    throw new Error("Missing AGENT_CHAT_PRIVATE_KEY in environment variables. Cannot authenticate via x402.");
  }
  return generateX402AuthHeader(privateKey);
}

/**
 * Tests connection to Venice AI by fetching the available models.
 */
export async function getVeniceModels() {
  console.log("[Venice] Fetching available models...");
  const authHeader = await getAuthHeader();

  const response = await fetch(VENICE_MODELS_URL, {
    method: "GET",
    headers: {
      "X-Sign-In-With-X": authHeader,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Venice API returned ${response.status}: ${text}`);
  }

  const data = await response.json();
  return data;
}

/**
 * Sends a chat message to Venice AI and returns the response.
 */
export async function testVeniceChat(userMessage: string) {
  console.log(`[Venice] Sending chat prompt: "${userMessage}"`);
  const authHeader = await getAuthHeader();

  const response = await fetch(VENICE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sign-In-With-X": authHeader,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b",
      messages: [
        { role: "system", content: "You are a helpful Web3 agent assistant." },
        { role: "user", content: userMessage },
      ],
      venice_parameters: {
        include_venice_system_prompt: false
      },
      temperature: 0.7,
      max_tokens: 200,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Venice API returned ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Venice API returned an empty response.");
  }

  return content;
}

/**
 * Sends a chat message to Venice AI with Web Search and Web Scraping enabled.
 */
export async function testVeniceWebSearchAndScraping(userMessage: string) {
  console.log(`[Venice] Sending prompt with Web Search/Scraping: "${userMessage}"`);
  const authHeader = await getAuthHeader();

  const response = await fetch(VENICE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sign-In-With-X": authHeader,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b",
      messages: [
        { role: "system", content: "You are a helpful Web3 agent assistant." },
        { role: "user", content: userMessage },
      ],
      venice_parameters: {
        enable_web_search: "on",
        enable_web_scraping: true,
        enable_web_citations: true,
        include_venice_system_prompt: false
      },
      temperature: 0.7,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Venice API returned ${response.status}: ${text}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error("Venice API returned an empty response.");
  }

  return content;
}

import * as fs from "fs";
import * as path from "path";

/**
 * Tests if the Venice AI model understands the agent identity and skills.
 */
export async function testAgentUnderstanding(chatHistory: any[], logs: string[] = [], chainId?: number, networkName?: string, hasDelegation?: boolean, userAddress?: string | null) {
  const log = (msg: string) => {
    console.log(msg);
    logs.push(msg);
  };

  const latestMessage = chatHistory[chatHistory.length - 1]?.text || chatHistory[chatHistory.length - 1]?.content;
  log(`\n[Agent] User intent: "${latestMessage}"`);

  // Load identity and skills
  const identityPath = path.join(process.cwd(), "agent", "identity.md");
  const sendSkillPath = path.join(process.cwd(), "agent", "skills", "send-usdc", "SKILL.md");
  const webSkillPath = path.join(process.cwd(), "agent", "skills", "web-research", "SKILL.md");
  const rpcSkillPath = path.join(process.cwd(), "agent", "skills", "onchain-rpc", "SKILL.md");

  const identityContent = fs.readFileSync(identityPath, "utf-8");
  const sendSkillContent = fs.readFileSync(sendSkillPath, "utf-8");
  const webSkillContent = fs.readFileSync(webSkillPath, "utf-8");
  const rpcSkillContent = fs.readFileSync(rpcSkillPath, "utf-8");

  const systemPrompt = `
${identityContent}

You are Wallet Butler, an AI Web3 assistant. You have access to specialized tools to execute actions.
You are currently operating on ${networkName || "Base Sepolia"} (Chain ID: ${chainId || 84532}).
${userAddress ? `The user is currently connected with wallet address: ${userAddress}.
CRITICAL INSTRUCTION FOR USDC BALANCE: If the user asks for their balance, you MUST use the execute_onchain_rpc tool to hit the Venice RPC endpoint.
Do NOT use eth_getBalance (that is for ETH). You must use 'eth_call' to read the USDC Smart Contract.
Set 'method': 'eth_call'
Set 'parameters': [{"to": "0x036CbD53842c5426634e7929541eC2318f3dCF7e", "data": "0x70a08231000000000000000000000000${userAddress.replace("0x", "")}"}, "latest"]
The tool will automatically parse the result into a human-readable decimal amount (e.g. "1.4328 USDC"). Simply relay this exact decimal amount to the user.` : "The user has NOT connected their wallet yet."}
${hasDelegation 
  ? "The user HAS DELEGATED permissions to you. If they ask to execute a transfer, you can use the appropriate tool immediately to complete their request." 
  : "The user has NOT delegated permissions yet. If they ask you to perform any on-chain action (like transferring tokens), you MUST politely tell them to click the 'Delegate' button in the sidebar first. Do NOT attempt to use transaction tools until they are connected."}

If a user asks for information that requires a tool (like reading blockchain data or sending USDC), you MUST use the appropriate tool.
If you need more information from the user before you can use a tool (e.g., missing network, amount, or recipient), ask them politely.
CRITICAL: Do not invent or guess blockchain data. Always use the execute_onchain_rpc tool to fetch real data via Venice endpoints.
CRITICAL: If the user types gibberish (e.g. 'jahaahja'), meaningless characters, or does not clearly and explicitly request a transfer, DO NOT invoke any tools. Just respond conversationally or ask for clarification.
CRITICAL: ONLY invoke transaction tools if the user EXPLICITLY requests it in their LATEST message. Do NOT repeat or assume intents based on previous chat history.
`;

  // Map history to Venice format (role and content), filtering out transaction notifications to prevent cascading
  const formattedHistory = chatHistory
    .filter((msg: any) => msg.role === "user" || (!msg.text.includes("✅ **Transaction Submitted") && !msg.text.includes("Waiting for Webhook")))
    .map((msg: any) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.text || msg.content
    }));

  const messagesPayload = [
    { role: "system", content: systemPrompt },
    ...formattedHistory
  ];

  const tools = [
    {
      type: "function",
      function: {
        name: "execute_onchain_rpc",
        description: "Fetches real-time deterministic data from EVM blockchains. Use this to read balances, block numbers, or contract states via Venice API.",
        parameters: {
          type: "object",
          properties: {
            network: { type: "string", description: "Network slug (e.g., 'base-sepolia', 'ethereum-mainnet')" },
            method: { type: "string", description: "JSON-RPC method (e.g., 'eth_call', 'eth_getBalance')" },
            parameters: { type: "array", items: { type: "object" }, description: "Array of parameters for the JSON-RPC call. Must exactly match Ethereum RPC specification." }
          },
          required: ["network", "method", "parameters"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "prepare_usdc_transfer",
        description: "Prepares a transaction to send USDC to a recipient.",
        parameters: {
          type: "object",
          properties: {
            amount: { type: "number", description: "The amount of USDC to send" },
            recipient: { type: "string", description: "The recipient wallet address" }
          },
          required: ["amount", "recipient"]
        }
      }
    },

    {
      type: "function",
      function: {
        name: "schedule_transfer",
        description: "Schedules a recurring USDC transfer using a smart contract automation bot.",
        parameters: {
          type: "object",
          properties: {
            amount: { type: "number", description: "The amount of USDC to send per interval" },
            recipient: { type: "string", description: "The recipient wallet address" },
            interval: { type: "string", description: "The frequency of the transfer (e.g., 'daily', 'weekly')" }
          },
          required: ["amount", "recipient", "interval"]
        }
      }
    },
    {
      type: "function",
      function: {
        name: "execute_web_research",
        description: "Searches the web for general information, crypto news, gas prices sentiment, or summarizes URLs. DO NOT use this for precise blockchain state data.",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "The topic to search for or URL to scrape" }
          },
          required: ["query"]
        }
      }
    }
  ];

  log(`[Agent] Loaded Identity and Skills. Generating x402 SIWE Auth...`);
  const authHeader = await getAuthHeader();

  log(`[Venice] Sending request to llama-3.3-70b (Native Tool Calling)...`);
  const response = await fetch(VENICE_API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sign-In-With-X": authHeader,
    },
    body: JSON.stringify({
      model: "llama-3.3-70b",
      messages: messagesPayload,
      tools: tools,
      venice_parameters: {
        enable_web_search: "off",
        enable_web_scraping: false,
        include_venice_system_prompt: false
      },
      temperature: 0.1,
      max_tokens: 500,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    log(`[Venice] Error: HTTP ${response.status}`);
    throw new Error(`Venice API returned ${response.status}: ${text}`);
  }

  const balanceUsd = response.headers.get("x-venice-balance-usd") || undefined;
  const balanceDiem = response.headers.get("x-venice-balance-diem") || undefined;

  let x402BalanceUsd = null;
  let x402DiemBalanceUsd = null;

  try {
    const authHeader = await getAuthHeader();
    const privateKey = process.env.AGENT_CHAT_PRIVATE_KEY!;
    const formattedKey = privateKey.startsWith("0x") ? privateKey : `0x${privateKey}`;
    const account = privateKeyToAccount(formattedKey as `0x${string}`);
    
    const balRes = await fetch(`https://api.venice.ai/api/v1/x402/balance/${account.address}`, {
      headers: { "X-Sign-In-With-X": authHeader }
    });
    
    if (balRes.ok) {
      const balJson = await balRes.json();
      if (balJson.success && balJson.data) {
        x402BalanceUsd = balJson.data.balanceUsd;
        x402DiemBalanceUsd = balJson.data.diemBalanceUsd;
        log(`[Venice] x402 Balance: $${x402BalanceUsd} USDC, $${x402DiemBalanceUsd || 0} Diem`);
      }
    }
  } catch (e) {
    log(`[Venice] Failed to retrieve x402 balance.`);
  }

  const data = await response.json();
  const messageObj = data.choices?.[0]?.message;
  let content = messageObj?.content;
  const toolCalls = messageObj?.tool_calls;

  let intent = null;

  if (toolCalls && toolCalls.length > 0) {
    const toolCall = toolCalls[0];
    const functionName = toolCall.function.name;
    const args = JSON.parse(toolCall.function.arguments);

    log(`[Agent] ⚡ Native Tool Call Detected: ${functionName}`);

    if (functionName === "execute_onchain_rpc") {
      log(`[RPC] Executing ${args.method} on ${args.network}...`);

      const rpcAuthHeader = await getAuthHeader();
      const rpcResponse = await fetch(`${VENICE_RPC_URL}/${args.network}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sign-In-With-X": rpcAuthHeader,
        },
        body: JSON.stringify({
          jsonrpc: "2.0",
          method: args.method,
          params: args.parameters || [],
          id: 1,
        }),
      });

      let rpcResultData;
      if (!rpcResponse.ok) {
        const errorText = await rpcResponse.text();
        log(`[RPC] Error executing node request: HTTP ${rpcResponse.status} - ${errorText}`);
        rpcResultData = { error: "Failed to communicate with blockchain node." };
      } else {
        const rpcData = await rpcResponse.json();

        // Convert hex to decimal for numbers
        let finalResult = rpcData.result;
        if (typeof finalResult === 'string' && finalResult.startsWith('0x')) {
          if (args.method === "eth_blockNumber" || args.method === "eth_getBalance" || args.method === "eth_gasPrice") {
            finalResult = BigInt(finalResult).toString();
          } else if (args.method === "eth_call" && finalResult.length === 66) {
            // USDC balanceOf is 32 bytes (66 chars). Convert base units to USDC (6 decimals)
            const decimalBaseUnits = BigInt(finalResult).toString();
            // Pad with leading zeros if less than 7 digits (e.g., 1432852 -> "1432852", 500000 -> "0500000")
            const padded = decimalBaseUnits.padStart(7, '0');
            const integerPart = padded.slice(0, -6);
            const fractionalPart = padded.slice(-6).replace(/0+$/, ''); // remove trailing zeros
            const usdcAmount = fractionalPart.length > 0 ? `${integerPart}.${fractionalPart}` : integerPart;
            finalResult = `${finalResult} (Decoded USDC Amount: ${usdcAmount})`;
          }
        }

        log(`[RPC] Success! Result: ${finalResult}`);
        rpcResultData = { result: finalResult };
      }

      log(`[Agent] Returning tool result to AI for final summary...`);
      const summaryAuthHeader = await getAuthHeader();
      const summaryResponse = await fetch(VENICE_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Sign-In-With-X": summaryAuthHeader,
        },
        body: JSON.stringify({
          model: "llama-3.3-70b",
          messages: [
            ...messagesPayload,
            messageObj, // Assistant's message containing the tool_calls
            {
              role: "tool",
              tool_call_id: toolCall.id,
              content: JSON.stringify(rpcResultData)
            }
          ],
          venice_parameters: { include_venice_system_prompt: false },
          temperature: 0.1,
          max_tokens: 300,
        }),
      });

      if (summaryResponse.ok) {
        const summaryData = await summaryResponse.json();
        content = summaryData.choices?.[0]?.message?.content;
        log(`[Agent] ✅ Final summary generated.`);
      } else {
        log(`[Agent] Error generating summary: HTTP ${summaryResponse.status}`);
        content = "I fetched the blockchain data, but encountered an error generating the final response.";
      }
    } else if (functionName === "prepare_usdc_transfer" || functionName === "send_usdc_transaction") {
      log(`[Agent] USDC Transfer intent captured: ${args.amount} USDC to ${args.recipient}`);
      content = `Great! I have prepared a transaction to send ${args.amount} USDC to ${args.recipient}. Executing in background...`;
      intent = { action: "prepare_usdc_transfer", amount: args.amount, recipient: args.recipient };
    }
  } else if (content && content.includes("<function=")) {
    // Fallback for Inline XML Tool Calls (when model bypasses native JSON tool calls)
    const functionRegex = /<function=([^>]+)>(.*?)<\/function>/g;
    let match;
    while ((match = functionRegex.exec(content)) !== null) {
      const functionName = match[1];
      try {
        const args = JSON.parse(match[2]);
        log(`[Agent] ⚡ Inline Tool Call Detected: ${functionName}`);

        if (functionName === "prepare_usdc_transfer" || functionName === "send_usdc_transaction") {
          log(`[Agent] USDC Transfer intent captured: ${args.amount} USDC to ${args.recipient}`);
          content = `Great! I have captured your request to send ${args.amount} USDC to ${args.recipient}. Executing via 1Shot Relayer now...`;
          intent = { action: "prepare_usdc_transfer", amount: args.amount, recipient: args.recipient };
        }
      } catch (e) {
        log(`[Agent] Failed to parse inline tool arguments: ${match[2]}`);
      }
    }
  }

  if (!content && !intent && (!toolCalls || toolCalls.length === 0)) {
    log(`[Venice] Error: Empty response.`);
    throw new Error("Venice API returned an empty response.");
  }

  return { content, capturedLogs: logs, balanceUsd, balanceDiem, x402BalanceUsd, x402DiemBalanceUsd, intent };
}

/**
 * Tests the Venice Crypto RPC to read the latest block number on Base Mainnet.
 */
export async function testVeniceRPC() {
  console.log(`\n[Venice] Sending JSON-RPC request to base-mainnet...`);
  const authHeader = await getAuthHeader();

  const response = await fetch(`${VENICE_RPC_URL}/base-mainnet`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Sign-In-With-X": authHeader,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      method: "eth_blockNumber",
      params: [],
      id: 1,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Venice RPC returned ${response.status}: ${text}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC Error: ${JSON.stringify(data.error)}`);
  }

  // eth_blockNumber returns a hex string
  const blockNumber = parseInt(data.result, 16);
  return blockNumber;
}
