/**
 * WalletButler SDK
 * 
 * An infrastructure primitive that abstracts away MetaMask EIP-7715 delegations,
 * 1Shot API Relayers (EIP-7702), and Venice AI x402 Agentic intents.
 */

// 1. Agentic AI (Venice)
export { 
    testAgentUnderstanding as executeVeniceIntent, 
    testVeniceRPC as fetchVeniceCryptoRpc 
} from "../venice";

// 2. Relayer Engine (1Shot API)
export { 
    executeVia1ShotRelayer as dispatch1ShotTransaction,
    relayerUrlForChain
} from "../lib/oneshot";

export {
    buildRedelegationChain
} from "../lib/redelegation";

// 3. Smart Accounts Hooks (MetaMask)
export { 
    grantAgentPermissions as requestEIP7715Delegation 
} from "../lib/delegation";

/**
 * A conceptual wrapper for the React Hook presented in the README.
 * In a real-world npm package, this would contain the actual React logic,
 * but for this primitive it aggregates the core library functions.
 */
export function useAgenticAccount(config: { chainId: number, veniceModel: string }) {
    return {
        // Alias to the MetaMask kit action
        delegate: async (amountUsdc: number, durationDays: number) => {
            const { grantAgentPermissions } = await import("../lib/delegation");
            return grantAgentPermissions(amountUsdc, durationDays, config.chainId);
        },
        
        // Alias to the Venice AI intent parsing and 1Shot execution flow
        executeIntent: async (prompt: string, chatHistory: any[] = []) => {
            const { testAgentUnderstanding } = await import("../venice");
            // Appends the new prompt to the history and calls Venice
            const updatedHistory = [...chatHistory, { role: "user", content: prompt }];
            return testAgentUnderstanding(updatedHistory, [], config.chainId, "Network", true, null);
        }
    };
}
