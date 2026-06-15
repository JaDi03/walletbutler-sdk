---
name: Scheduled Transfer
description: Schedule a USDC transfer for a specific time interval or a moment in the future.
---

# Skill: Scheduled Transfer

## Description
This skill allows Wallet Butler to set a timer to defer the execution of a USDC transfer.

## Use Cases (Examples)
- "Send 1 USDC in 2 minutes."
- "Send 5 USDC in 5 minutes to wallet X."

## Required Information
For this intent to be complete and ready for execution, you must collect:
1. **Amount**: The amount of USDC to send.
2. **Time/Interval**: When the transaction should be executed (e.g. "in 2 minutes").
3. **Recipient**: The address of the destination wallet.

## Execution Process
1. Extract the intent to schedule a transfer.
2. Validate Amount, Time, and Recipient. Ask for whatever is missing.
3. The Agent confirms the task.
4. The timer runs in the background.
5. Once the time is reached, the transaction is executed via 1Shot.
