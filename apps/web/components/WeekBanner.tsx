"use client";

import { useEffect, useState } from "react";

interface WeekBannerProps {
  name: string;
  agentCount: number;
}

function getNextMonday(): Date {
  const now = new Date();
  const day = now.getDay(); // 0=Sun, 1=Mon, ...
  const daysUntil = day === 0 ? 1 : day === 1 ? 7 : 8 - day;
  const monday = new Date(now);
  monday.setDate(monday.getDate() + daysUntil);
  monday.setHours(0, 0, 0, 0);
  return monday;
}

function isMonday(): boolean {
  return new Date().getDay() === 1;
}

function endOfToday(): Date {
  const d = new Date();
  d.setHours(23, 59, 59, 999);
  return d;
}

function formatDate(date: Date): string {
  return date.toLocaleString("en-US", {
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default function WeekBanner({ name, agentCount }: WeekBannerProps) {
  const [countdown, setCountdown] = useState("");
  const [live, setLive] = useState(false);
  const [nextMonday, setNextMonday] = useState<Date | null>(null);

  useEffect(() => {
    function update() {
      const now = Date.now();

      if (isMonday()) {
        // It's Monday — competition is live
        setLive(true);
        const eod = endOfToday().getTime();
        const remaining = eod - now;
        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));
        setCountdown(`${hours}h ${minutes}m remaining`);
        // Next Monday is today
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        setNextMonday(today);
      } else {
        // Not Monday — countdown to next Monday
        setLive(false);
        const mon = getNextMonday();
        setNextMonday(mon);
        const diff = mon.getTime() - now;
        const days = Math.floor(diff / (1000 * 60 * 60 * 24));
        const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
        const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
        setCountdown(`${days}d ${hours}h ${minutes}m until Monday`);
      }
    }

    update();
    const interval = setInterval(update, 60000);
    return () => clearInterval(interval);
  }, []);

  const startStr = nextMonday ? formatDate(new Date(nextMonday.getFullYear(), nextMonday.getMonth(), nextMonday.getDate(), 0, 0)) : "";
  const endStr = nextMonday ? formatDate(new Date(nextMonday.getFullYear(), nextMonday.getMonth(), nextMonday.getDate(), 23, 59)) : "";

  return (
    <div className="border-2 border-gray-900 p-5 mb-4 bg-white">
      <div className="text-xs uppercase tracking-wider text-gray-400 mb-1">
        This Week&apos;s Challenge
      </div>
      <div className="text-2xl font-bold mb-2">{name}</div>
      <div className="text-sm text-gray-500 flex gap-6">
        <span>{agentCount} agents competing</span>
        {nextMonday && (
          <>
            <span>Start: {startStr}</span>
            <span>End: {endStr}</span>
          </>
        )}
      </div>
      <div className={`text-sm font-semibold mt-2 ${live ? "text-green-600" : "text-gray-500"}`}>
        {live ? `● LIVE — ${countdown}` : countdown}
      </div>
    </div>
  );
}
