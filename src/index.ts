import { config } from "dotenv";
import { getVeniceModels, testVeniceChat, testVeniceWebSearchAndScraping, testAgentUnderstanding, testVeniceRPC } from "./venice";

// Load environment variables from .env file
config();

async function main() {
  console.log("🚀 Starting WalletButler Venice AI Test");

  if (!process.env.AGENT_CHAT_PRIVATE_KEY) {
    console.error("❌ ERROR: Please set AGENT_CHAT_PRIVATE_KEY in your .env file.");
    process.exit(1);
  }

  try {
    // Test 1: Fetch Models
    const modelsData = await getVeniceModels();
    console.log("✅ Successfully fetched models!");
    console.log(`   Found ${modelsData.data?.length || 0} models available.\n`);

    // Test 2: Chat Completion
    const prompt = "Please respond with 'Hello, Hackathon! I am Venice AI and I am ready.' and nothing else.";
    const response = await testVeniceChat(prompt);
    
    console.log("\n✅ Successfully received chat response!");
    console.log(`🤖 Venice AI: ${response}`);

    // Test 3: Web Search and Scraping
    const searchPrompt = "Search the web for the current price of Ethereum and also summarize what https://ethereum.org/en/ is about.";
    const searchResponse = await testVeniceWebSearchAndScraping(searchPrompt);
    
    console.log("\n✅ Successfully received Web Search/Scraping response!");
    console.log(`🤖 Venice AI: ${searchResponse}`);

    // Test 4: Agent Understanding
    const incompleteIntent = "Send 50 USDC please.";
    const agentResponse1 = await testAgentUnderstanding([{ role: "user", content: incompleteIntent }]);
    console.log(`🤖 Wallet Butler: ${agentResponse1.content}`);

    const completeIntent = "Send 50 USDC to 0x1234567890123456789012345678901234567890";
    const agentResponse2 = await testAgentUnderstanding([{ role: "user", content: completeIntent }]);
    console.log(`🤖 Wallet Butler: ${agentResponse2.content}`);

    const researchIntent = "Can you search the web for the latest Ethereum gas price?";
    const agentResponse3 = await testAgentUnderstanding([{ role: "user", content: researchIntent }]);
    console.log(`\n🤖 Wallet Butler (Research): ${agentResponse3.content}`);

    // Test 6: Venice Crypto RPC
    const blockNumber = await testVeniceRPC();
    console.log(`\n✅ Successfully fetched Base Mainnet Block Number via Venice Crypto RPC: ${blockNumber}`);

    // Test 7: Agent Understanding (On-Chain RPC)
    const rpcIntent = "What is the ETH balance of 0xd8dA6BF26964aF9D7eEd9e03E53415D37aA96045 on Base Mainnet?";
    const agentResponse4 = await testAgentUnderstanding([{ role: "user", content: rpcIntent }]);
    console.log(`\n🤖 Wallet Butler (On-Chain RPC): ${agentResponse4.content}`);

  } catch (error) {
    console.error("❌ An error occurred during Venice AI tests:");
    console.error(error);
    process.exit(1);
  }
}

main();
