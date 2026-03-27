"use client";

import { useEffect, useState } from "react";

interface ActivityItem {
  id: string;
  agentName: string;
  actionType: string;
  ticker: string | null;
  quantity: number | null;
  price: number | null;
  rejected: boolean;
  rejectionReason: string | null;
  createdAt: string;
}

interface ActivityFeedProps {
  items: ActivityItem[];
}

function timeAgo(dateStr: string): string {
  const now = Date.now();
  const date = new Date(dateStr).getTime();
  const diff = now - date;
  const minutes = Math.floor(diff / 60000);

  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function TimeAgo({ dateStr }: { dateStr: string }) {
  const [text, setText] = useState("");

  useEffect(() => {
    setText(timeAgo(dateStr));
    const interval = setInterval(() => setText(timeAgo(dateStr)), 30000);
    return () => clearInterval(interval);
  }, [dateStr]);

  return <span>{text}</span>;
}

export default function ActivityFeed({ items }: ActivityFeedProps) {
  if (items.length === 0) {
    return (
      <div className="border border-gray-200 bg-white p-6 text-center text-gray-400 text-sm">
        No activity yet.
      </div>
    );
  }

  return (
    <div className="border border-gray-200 bg-white flex flex-col" style={{ maxHeight: "600px" }}>
      <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider border-b border-gray-100 shrink-0">
        Live Activity
      </div>
      <div className="overflow-y-auto flex-1">
        {items.map((item) => (
          <div key={item.id} className="px-4 py-3 border-b border-gray-50 text-sm">
            <div className="text-xs text-gray-400">
              <TimeAgo dateStr={item.createdAt} />
            </div>
            <div>
              <strong>{item.agentName}</strong>{" "}
              {/* Stock actions */}
              {item.actionType === "hold" && "held position"}
              {item.actionType === "buy" && !item.rejected && <>bought {item.quantity} {item.ticker} @ ${item.price?.toFixed(2)}</>}
              {item.actionType === "sell" && !item.rejected && <>sold {item.quantity} {item.ticker} @ ${item.price?.toFixed(2)}</>}
              {(item.actionType === "buy" || item.actionType === "sell") && item.rejected && (
                <span className="text-red-500">tried to {item.actionType} {item.quantity} {item.ticker} — {item.rejectionReason}</span>
              )}
              {/* Poker actions */}
              {item.actionType === "fold" && <span className="text-red-500">folded</span>}
              {item.actionType === "call" && <>called{item.price ? ` $${item.price.toFixed(0)}` : ""}</>}
              {item.actionType === "raise" && <span className="text-green-600">raised{item.price ? ` $${item.price.toFixed(0)}` : ""}</span>}
              {item.actionType === "check" && "checked"}
              {item.actionType === "play" && (item.rejectionReason || "played")}
              {/* Errors */}
              {item.actionType === "timeout" && <span className="text-red-500">timed out</span>}
              {item.actionType === "error" && <span className="text-red-500">error</span>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
