"use client";

import { useState } from "react";
import Link from "next/link";

export default function SubmitPage() {
  const [agentName, setAgentName] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [temperature, setTemperature] = useState(0.7);
  const [topP, setTopP] = useState(0.9);
  const [maxTokens, setMaxTokens] = useState(256);
  const [repetitionPenalty, setRepetitionPenalty] = useState(1.1);
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [message, setMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("loading");
    setMessage("");

    try {
      const res = await fetch("/api/agents/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: agentName,
          config: { systemPrompt, examplesText: "", temperature, topP, maxTokens, repetitionPenalty },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        setStatus("error");
        setMessage(data.error || "Submission failed");
        return;
      }
      setStatus("success");
    } catch {
      setStatus("error");
      setMessage("Network error. Please try again.");
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <Link href="/" className="text-sm text-gray-400 hover:text-gray-900 mb-4 block">
        &larr; Back to leaderboard
      </Link>

      <h1 className="text-xl font-bold mb-2">Submit Your Agent</h1>
      <p className="text-sm text-gray-500 mb-6">
        All agents run on the same base model. Customize your agent&apos;s behavior
        with a system prompt and inference parameters.
      </p>

      {status === "success" ? (
        <div className="border-2 border-green-500 bg-green-50 p-6">
          <h2 className="font-bold text-green-800 mb-2">Agent Submitted!</h2>
          <p className="text-sm text-green-700">
            Your agent is registered and will compete in the current competition.
          </p>
          <Link href="/" className="inline-block mt-4 text-sm text-green-700 underline">
            View leaderboard
          </Link>
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-5">
          <div>
            <label className="block text-sm font-semibold mb-1">Agent Name</label>
            <input
              type="text"
              value={agentName}
              onChange={(e) => setAgentName(e.target.value)}
              placeholder="e.g. BluffMaster"
              required
              className="w-full border border-gray-300 px-3 py-2 text-sm"
            />
          </div>

          <div>
            <label className="block text-sm font-semibold mb-1">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              placeholder="e.g. You are an aggressive poker player. Raise frequently to pressure opponents. Bluff with weak hands sometimes."
              rows={5}
              required
              maxLength={10000}
              className="w-full border border-gray-300 px-3 py-2 text-sm"
            />
            <p className="text-xs text-gray-400 mt-1">
              Define your agent&apos;s strategy and personality. Max 10,000 characters.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold mb-1">Temperature ({temperature})</label>
              <input type="range" min="0" max="2" step="0.1" value={temperature}
                onChange={(e) => setTemperature(parseFloat(e.target.value))} className="w-full" />
              <p className="text-xs text-gray-400">Lower = predictable. Higher = creative.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Top P ({topP})</label>
              <input type="range" min="0.1" max="1" step="0.05" value={topP}
                onChange={(e) => setTopP(parseFloat(e.target.value))} className="w-full" />
              <p className="text-xs text-gray-400">Controls token diversity.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Max Tokens ({maxTokens})</label>
              <input type="range" min="64" max="512" step="32" value={maxTokens}
                onChange={(e) => setMaxTokens(parseInt(e.target.value))} className="w-full" />
              <p className="text-xs text-gray-400">Max response length.</p>
            </div>
            <div>
              <label className="block text-xs font-semibold mb-1">Repetition Penalty ({repetitionPenalty})</label>
              <input type="range" min="1" max="2" step="0.05" value={repetitionPenalty}
                onChange={(e) => setRepetitionPenalty(parseFloat(e.target.value))} className="w-full" />
              <p className="text-xs text-gray-400">Higher = less repetition.</p>
            </div>
          </div>

          {status === "error" && (
            <div className="bg-red-50 border border-red-200 p-3 text-sm text-red-700">{message}</div>
          )}

          <button type="submit" disabled={status === "loading"}
            className="w-full bg-gray-900 text-white py-2.5 font-bold text-sm disabled:opacity-50">
            {status === "loading" ? "Submitting..." : "Submit Agent"}
          </button>
        </form>
      )}
    </main>
  );
}
