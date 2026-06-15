"use client";
import React, { useState, useEffect, useRef } from "react";
import { grantAgentPermissions } from "../src/lib/delegation";

export default function Dashboard() {
  const [messages, setMessages] = useState<{ role: "user" | "agent"; text: string; taskId?: string }[]>([
    { role: "agent", text: "Hello, I am Wallet Butler. How can I assist you with your Smart Account today?" }
  ]);
  const [input, setInput] = useState("");
  const [terminalLogs, setTerminalLogs] = useState<string[]>(["[System] Initializing Wallet Butler OS...", "[System] Ready."]);
  const [loading, setLoading] = useState(false);
  const [balance, setBalance] = useState<{usd?: string, diem?: string, x402Usd?: number, x402Diem?: number, isX402?: boolean}>({});
  const [chainId, setChainId] = useState<number>(84532);
  const [address, setAddress] = useState<string | null>(null);
  const [isConnecting, setIsConnecting] = useState(false);
  const [activeSession, setActiveSession] = useState<{ limit: number, expireDays: number, context?: any } | null>(null);
  const [spendLimit, setSpendLimit] = useState<number>(20);
  const [expireDays, setExpireDays] = useState<number>(5);
  const networkName = chainId === 84532 ? "Base Sepolia" : "Base Mainnet";
  const chatEndRef = useRef<HTMLDivElement>(null);
  const terminalEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [terminalLogs]);

  const addLog = (log: string) => {
    setTerminalLogs((prev) => [...prev, log]);
  };

  const simulateTerminalTyping = async (logs: string[]) => {
    for (const log of logs) {
      await new Promise(r => setTimeout(r, 400)); // Delay between logs to look real
      addLog(log);
    }
  };

  const connectWallet = async () => {
    if (!(window as any).ethereum) {
      addLog("[Error] MetaMask is not installed.");
      return;
    }
    setIsConnecting(true);
    try {
      const accounts = await (window as any).ethereum.request({ method: "eth_requestAccounts" });
      if (accounts && accounts.length > 0) {
        setAddress(accounts[0]);
        addLog(`[System] Connected to MetaMask: ${accounts[0]}`);
      }
    } catch (err: any) {
      addLog(`[Error] Connection failed: ${err.message}`);
    } finally {
      setIsConnecting(false);
    }
  };

  const handleDelegate = async () => {
    try {
      addLog(`[System] Requesting EIP-7715 permissions for ${spendLimit} USDC over ${expireDays} days...`);
      const permissionsContext = await grantAgentPermissions(spendLimit, expireDays, chainId);
      setActiveSession({ limit: spendLimit, expireDays, context: permissionsContext });
      addLog(`[System] ✅ Permission granted and session saved!`);
    } catch (err: any) {
      addLog(`[Error] Delegation failed: ${err.message}`);
    }
  };

  const disconnectWallet = () => {
    setAddress(null);
    setActiveSession(null);
    addLog(`[System] Wallet disconnected.`);
  };

  const revokeSession = () => {
    setActiveSession(null);
    addLog(`[System] EIP-7715 Delegation revoked locally.`);
  };

  const handleSend = async () => {
    if (!input.trim()) return;
    const userMsg = input;
    setInput("");

    // Create the updated messages array
    const updatedMessages: { role: "user" | "agent"; text: string; taskId?: string }[] = [...messages, { role: "user", text: userMsg }];
    setMessages(updatedMessages);

    setLoading(true);
    addLog(`> Processing user intent: "${userMsg}"`);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        // Send the full chat history excluding the initial hardcoded greeting if desired, 
        // or just send everything so the AI has full context.
        body: JSON.stringify({ messages: updatedMessages, chainId, networkName, hasDelegation: !!activeSession, userAddress: address }),
      });

      const data = await res.json();

      if (data.balanceUsd || data.balanceDiem) {
        setBalance({ usd: data.balanceUsd, diem: data.balanceDiem, isX402: false });
      } else if (data.x402BalanceUsd !== undefined) {
        setBalance({ isX402: true, x402Usd: data.x402BalanceUsd, x402Diem: data.x402DiemBalanceUsd });
      } else {
        setBalance({ isX402: true, x402Usd: 0 });
      }

      if (data.logs && data.logs.length > 0) {
        simulateTerminalTyping(data.logs);
      }

      if (data.error) {
        addLog(`[Error] ${data.error}`);
        setMessages(prev => [...prev, { role: "agent", text: "Sorry, I encountered an error. Check the terminal." }]);
      } else {
        addLog(`[System] Execution complete.`);
        setMessages(prev => [...prev, { role: "agent", text: data.response }]);
        
        if (data.intent && data.intent.action === "prepare_usdc_transfer" && activeSession) {
          addLog(`[System] Background Execution: Submitting JIT redelegation using active session key...`);
          try {
            const relayerRes = await fetch("/api/agent/redelegate", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                rootDelegation: activeSession.context,
                intent: data.intent,
                recipient: data.intent.recipient || address,
                chainId,
              }),
            });
            const relayerData = await relayerRes.json();
            if (relayerData.error) {
              addLog(`[Fatal] 1Shot Execution Failed: ${relayerData.error}`);
              setMessages(prev => [...prev, { role: "agent", text: `❌ **Transaction Failed:** ${relayerData.error}` }]);
            } else {
              const taskId = relayerData.taskId; 
              addLog(`[System] Transaction submitted to 1Shot. Task ID: ${taskId}`);
              
              // Add temporary message
              setMessages(prev => [...prev, { role: "agent", text: `⏳ **Transaction Submitted!**\n\nWaiting for 1Shot Webhook to verify confirmation...\n*(Task ID: ${taskId})*`, taskId }]);

              // Start polling our local webhook status endpoint
              const pollInterval = setInterval(async () => {
                try {
                  const statusRes = await fetch(`/api/webhook/status?taskId=${taskId}`);
                  const statusData = await statusRes.json();
                  
                  if (statusData.status === "confirmed") {
                    clearInterval(pollInterval);
                    const txHash = statusData.txHash;
                    addLog(`[System] ✅ Webhook verified! Hash: ${txHash}`);
                    const url = chainId === 84532 ? `https://sepolia.basescan.org/tx/${txHash}` : `https://basescan.org/tx/${txHash}`;
                    
                    setMessages(prev => prev.map(m => 
                      m.taskId === taskId 
                        ? { ...m, text: `✅ **Webhook Verified & Confirmed**\n\n[View on BaseScan](${url})\n\`${txHash}\`` }
                        : m
                    ));
                  } else if (statusData.status === "failed") {
                    clearInterval(pollInterval);
                    addLog(`[Fatal] 1Shot Execution Failed via Webhook`);
                    setMessages(prev => prev.map(m => 
                      m.taskId === taskId 
                        ? { ...m, text: `❌ **Transaction Failed:** The webhook reported a failure for Task ID ${taskId}.` }
                        : m
                    ));
                  }
                } catch (e) {
                  // ignore poll errors
                }
              }, 3000);
            }
          } catch (relayerErr: any) {
            addLog(`[Fatal] Relayer API error: ${relayerErr.message}`);
          }
        }
      }
    } catch (error: any) {
      addLog(`[Fatal] Network error: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dashboard-container">
      {/* Sidebar - Fake Widgets for aesthetics */}
      <div className="panel glass sidebar">
        <h2 style={{ marginBottom: 20 }}>Wallet Butler</h2>
        <div className="stat-card">
          <p style={{ fontSize: 14, opacity: 0.8 }}>Venice Network Balance</p>
          {(balance.usd || balance.diem || balance.isX402) ? (
             <div style={{ marginTop: 8 }}>
               {balance.isX402 ? (
                 <>
                   <h1 style={{ fontSize: 24, color: '#00ff00' }}>x402 SIWE</h1>
                   <div style={{ fontSize: 14, opacity: 0.9, marginTop: 4 }}>
                     <span style={{ color: '#fff' }}>${balance.x402Usd?.toFixed(2)} USDC</span>
                     {balance.x402Diem !== undefined && balance.x402Diem !== null && (
                       <span style={{ color: '#4ade80', marginLeft: 8 }}>+ ${balance.x402Diem?.toFixed(2)} DIEM</span>
                     )}
                   </div>
                 </>
               ) : (
                 <>
                   {balance.usd && <h1 style={{ fontSize: 24 }}>${parseFloat(balance.usd).toFixed(4)}</h1>}
                   {balance.diem && <p style={{ fontSize: 16 }}>{parseFloat(balance.diem).toFixed(2)} Diem</p>}
                 </>
               )}
             </div>
          ) : (
             <h3 style={{ marginTop: 8 }}>Loading...</h3>
          )}
        </div>
        <div className="stat-card" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)' }}>
          <p style={{ fontSize: 14, opacity: 0.8 }}>Active Network</p>
          <div style={{ marginTop: 8, display: 'flex', gap: 8 }}>
            <button 
              onClick={() => setChainId(84532)}
              style={{ padding: '4px 8px', background: chainId === 84532 ? '#4ade80' : '#333', color: chainId === 84532 ? '#000' : '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              Sepolia
            </button>
            <button 
              onClick={() => setChainId(8453)}
              style={{ padding: '4px 8px', background: chainId === 8453 ? '#4ade80' : '#333', color: chainId === 8453 ? '#000' : '#fff', border: 'none', borderRadius: 4, cursor: 'pointer' }}
            >
              Mainnet
            </button>
          </div>
        </div>
        <div className="stat-card" style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', marginTop: 12 }}>
          <p style={{ fontSize: 14, opacity: 0.8 }}>EIP-7715 Delegation</p>
          {!address ? (
            <button 
              onClick={connectWallet}
              disabled={isConnecting}
              style={{ marginTop: 8, padding: '8px 12px', background: '#f6851b', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', width: '100%' }}
            >
              {isConnecting ? "Connecting..." : "Connect Wallet"}
            </button>
          ) : !activeSession ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 4 }}>
                <p style={{ fontSize: 12 }}>{address.slice(0, 6)}...{address.slice(-4)}</p>
                <button onClick={disconnectWallet} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>Disconnect</button>
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, opacity: 0.8 }}>Amount (USDC)</label>
                  <input type="number" value={spendLimit} onChange={e => setSpendLimit(Number(e.target.value))} style={{ width: '100%', padding: '4px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 4 }} />
                </div>
                <div style={{ flex: 1 }}>
                  <label style={{ fontSize: 10, opacity: 0.8 }}>Duration (Days)</label>
                  <input type="number" value={expireDays} onChange={e => setExpireDays(Number(e.target.value))} style={{ width: '100%', padding: '4px', background: '#222', color: '#fff', border: '1px solid #444', borderRadius: 4 }} />
                </div>
              </div>
              <button 
                onClick={handleDelegate}
                style={{ marginTop: 8, padding: '8px 12px', background: '#3b82f6', color: '#fff', border: 'none', borderRadius: 4, cursor: 'pointer', width: '100%' }}
              >
                Delegate
              </button>
            </>
          ) : (
            <div style={{ marginTop: 8, padding: '8px', background: 'rgba(16, 185, 129, 0.1)', border: '1px solid #10b981', borderRadius: 4, textAlign: 'center' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <strong style={{ color: '#10b981' }}>Session Active</strong>
                <button onClick={disconnectWallet} style={{ background: 'transparent', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 12 }}>Disconnect</button>
              </div>
              <p style={{ fontSize: 12, marginTop: 4 }}>Agent can spend up to {activeSession.limit} USDC.</p>
              <button onClick={revokeSession} style={{ marginTop: 8, padding: '4px 8px', background: 'rgba(239, 68, 68, 0.2)', color: '#ef4444', border: '1px solid rgba(239, 68, 68, 0.5)', borderRadius: 4, cursor: 'pointer', width: '100%', fontSize: 12 }}>
                Revoke Session
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Main Chat Interface */}
      <div className="panel glass chat-section">
        <div className="chat-history">
          {messages.map((m, i) => {
            const renderText = (text: string) => {
              const parts = text.split(/(\[[^\]]+\]\([^)]+\))/g);
              return parts.map((part, j) => {
                const match = part.match(/\[([^\]]+)\]\(([^)]+)\)/);
                if (match) {
                  return <a key={j} href={match[2]} target="_blank" rel="noopener noreferrer" style={{ color: '#4ade80', textDecoration: 'underline' }}>{match[1]}</a>;
                }
                return <span key={j}>{part}</span>;
              });
            };

            return (
              <div key={i} className={`chat-bubble ${m.role === "user" ? "bubble-user" : "bubble-agent"}`}>
                <strong style={{ display: 'block', marginBottom: 4, color: m.role === 'user' ? '#ff7b00' : '#8e8e93' }}>
                  {m.role === "user" ? "You" : "Butler"}
                </strong>
                <div style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>{renderText(m.text)}</div>
              </div>
            );
          })}
          {loading && (
            <div className="chat-bubble bubble-agent" style={{ opacity: 0.7 }}>
              <em>Thinking...</em>
            </div>
          )}
          <div ref={chatEndRef} />
        </div>
        <div className="chat-input-container">
          <input
            className="chat-input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Ask Wallet Butler to send USDC..."
            disabled={loading}
          />
          <button className="send-btn" onClick={handleSend} disabled={loading || !input.trim()}>
            Send
          </button>
        </div>
      </div>

      {/* Terminal Logs */}
      <div className="panel terminal-section">
        <div className="terminal-header">Backend Terminal (Live)</div>
        {terminalLogs.map((log, i) => {
          let className = "terminal-log";
          if (log.includes("[System]")) className += " system";
          if (log.includes("[Error]") || log.includes("[Fatal]")) className += " error";
          if (log.includes("[Venice]") || log.includes("✅")) className += " highlight";
          return <div key={i} className={className}>{log}</div>;
        })}
        <div ref={terminalEndRef} />
      </div>
    </div>
  );
}
