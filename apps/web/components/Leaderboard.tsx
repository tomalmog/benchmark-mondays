"use client";

import Link from "next/link";

interface LeaderboardEntry {
  id: string;
  name: string;
  githubLogin: string;
  totalValue: number;
  cash: number;
  invested: number;
  tradeCount: number;
  rank: number;
}

interface LeaderboardProps {
  entries: LeaderboardEntry[];
  arenaType?: string;
}

export default function Leaderboard({ entries, arenaType }: LeaderboardProps) {
  if (entries.length === 0) {
    return (
      <div className="border border-gray-200 bg-white p-8 text-center text-gray-400">
        No agents competing yet.
      </div>
    );
  }

  const isPoker = arenaType === "poker";

  return (
    <div className="border border-gray-200 bg-white overflow-x-auto">
      <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider border-b border-gray-100">
        Live Leaderboard
      </div>
      {isPoker ? (
        <div className="min-w-0">
          <div className="grid grid-cols-[28px_1fr_auto_auto_auto] gap-x-3 px-3 sm:px-4 py-2 text-xs uppercase text-gray-400 font-semibold border-b border-gray-200">
            <span>#</span>
            <span>Agent</span>
            <span className="text-right">Bankroll</span>
            <span className="text-right">P&L</span>
            <span className="text-right">Actions</span>
          </div>
          {entries.map((entry) => {
            const pnl = entry.totalValue - 100000;
            return (
              <Link
                key={entry.id}
                href={`/agent/${entry.id}`}
                className="grid grid-cols-[28px_1fr_auto_auto_auto] gap-x-3 px-3 sm:px-4 py-3 border-b border-gray-50 hover:bg-gray-50 items-center text-sm"
              >
                <span className={`font-bold text-sm sm:text-base ${entry.rank <= 3 ? "text-gray-900" : "text-gray-400"}`}>
                  {entry.rank}
                </span>
                <span className="min-w-0 overflow-hidden">
                  <span className="font-semibold truncate block">{entry.name}</span>
                  <span className="text-xs text-gray-400 truncate block">@{entry.githubLogin}</span>
                </span>
                <span className="text-right font-semibold text-gray-900 whitespace-nowrap text-xs sm:text-sm">
                  ${entry.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
                <span className={`text-right font-semibold whitespace-nowrap text-xs sm:text-sm ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {pnl >= 0 ? "+" : ""}${pnl.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
                <span className="text-right text-gray-500 text-xs whitespace-nowrap">
                  {entry.tradeCount}
                </span>
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="min-w-0">
          <div className="grid grid-cols-[28px_1fr_auto_auto_auto_auto] gap-x-3 px-3 sm:px-4 py-2 text-xs uppercase text-gray-400 font-semibold border-b border-gray-200">
            <span>#</span>
            <span>Agent</span>
            <span className="text-right">Total</span>
            <span className="text-right hidden sm:block">Invested</span>
            <span className="text-right">P&L</span>
            <span className="text-right">Trades</span>
          </div>
          {entries.map((entry) => {
            const pnl = entry.totalValue - 100000;
            return (
              <Link
                key={entry.id}
                href={`/agent/${entry.id}`}
                className="grid grid-cols-[28px_1fr_auto_auto_auto_auto] gap-x-3 px-3 sm:px-4 py-3 border-b border-gray-50 hover:bg-gray-50 items-center text-sm"
              >
                <span className={`font-bold text-sm sm:text-base ${entry.rank <= 3 ? "text-gray-900" : "text-gray-400"}`}>
                  {entry.rank}
                </span>
                <span className="min-w-0 overflow-hidden">
                  <span className="font-semibold truncate block">{entry.name}</span>
                  <span className="text-xs text-gray-400 truncate block">@{entry.githubLogin}</span>
                </span>
                <span className="text-right font-semibold text-gray-900 whitespace-nowrap text-xs sm:text-sm">
                  ${entry.totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
                <span className="text-right text-gray-500 text-xs whitespace-nowrap hidden sm:block">
                  ${entry.invested.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
                <span className={`text-right font-semibold whitespace-nowrap text-xs sm:text-sm ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {pnl >= 0 ? "+" : ""}${pnl.toLocaleString("en-US", { maximumFractionDigits: 0 })}
                </span>
                <span className="text-right text-gray-500 text-xs whitespace-nowrap">
                  {entry.tradeCount.toLocaleString()}
                </span>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
