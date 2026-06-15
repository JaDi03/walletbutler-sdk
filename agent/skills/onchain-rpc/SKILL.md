---
name: On-Chain RPC
description: Read blockchain data directly using the Venice Crypto RPC endpoint (e.g., balances, block numbers, smart contract state).
---

# Skill: On-Chain RPC

## Description
This skill allows Wallet Butler to fetch real-time, deterministic on-chain data directly from supported EVM blockchains (Ethereum, Base, Arbitrum, Optimism, etc.) using the Venice JSON-RPC 2.0 proxy.
**CRITICAL RULE**: Use this skill ONLY when you need exact blockchain state (balances, smart contract reads, block numbers). Do not use this for general news or summarizing URLs.

## Use Cases (Examples)
- "What is my USDC balance on Base?"
- "Has this transaction been confirmed?"
- "Read the exact state of this smart contract."

## Required Information
For this intent to be complete, you must collect:
1. **Network**: The target blockchain (e.g., Base Mainnet, Arbitrum Sepolia).
2. **Method**: The JSON-RPC method to call (e.g., `eth_getBalance`, `eth_call`).
3. **Parameters**: The exact parameters required for the RPC call (e.g., wallet address, contract address).

## Execution Process
1. Extract the intent to read on-chain data.
2. Determine the network slug (e.g., `base-mainnet`) and formulate the standard JSON-RPC 2.0 payload.
3. If any required parameters are missing, politely ask the user.
4. If complete, generate a JSON object representing the RPC read action, specifying the network slug and the RPC payload.
