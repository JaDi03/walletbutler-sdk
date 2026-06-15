---
name: Web Research
description: Search the web and scrape URLs to gather real-time data, prices, or news to answer user queries.
---

# Skill: Web Research

## Description
This skill allows Wallet Butler to access real-time information from the internet. It is strictly for reading general web content, news, reading articles, or finding out high-level information (e.g., general crypto trends). 
**CRITICAL RULE**: Do NOT use this skill for deterministic blockchain data like a specific user's wallet balance or a smart contract state. Use the `On-Chain RPC` skill for that.

## Use Cases (Examples)
- "What is the general sentiment on the Ethereum gas price today?"
- "Summarize this article: https://example.com/crypto-news"
- "Search the web for the latest airdrops."

## Required Information
For this intent to be complete, you must collect:
1. **Query or URL**: The specific topic to search for or the URL to scrape.

## Execution Process
1. Extract the intent to perform web research or summarize a URL.
2. Formulate the search query based on the user's request.
3. The underlying Venice AI engine will automatically execute the search or scraping based on the enabled parameters.
4. Provide the user with a concise summary of the findings, citing sources when possible.
