---
name: Send USDC
description: Send USDC from one account to another using the Smart Account and 1Shot for gas.
---

# Skill: Send USDC

## Description
This skill allows Wallet Butler to transfer USDC to a specific address (wallet or ENS).

## Use Cases (Examples)
- "Send 5 USDC to this wallet."
- "Send 20 dollars to John."

## Required Information
For this intent to be complete and ready for execution, you must collect:
1. **Amount**: The amount of USDC to send.
2. **Recipient**: The destination address (0x...) or a name/identifier that can be resolved to an address.

## Execution Process
1. Extract the intent to send USDC.
2. If the Amount or Recipient is missing, ask the user.
3. Once complete, formulate the transaction to be signed via the MetaMask Smart Account.
4. Delegate execution to 1Shot, ensuring the fee is deducted from the USDC balance.
