"use client";

import Link from "next/link";
import { useSession, signIn, signOut } from "next-auth/react";
import { useEffect, useState } from "react";

export default function NavBar() {
  const { data: session, status } = useSession();
  const [hasAgent, setHasAgent] = useState(false);
  const [checkedAgent, setCheckedAgent] = useState(false);

  useEffect(() => {
    if (status !== "authenticated") { setCheckedAgent(false); return; }
    fetch("/api/my-agent")
      .then((res) => { setHasAgent(res.ok); setCheckedAgent(true); })
      .catch(() => setCheckedAgent(true));
  }, [status]);

  return (
    <div className="flex justify-between items-center mb-4">
      <Link href="/" className="text-xl font-bold tracking-tight">
        BENCHMARK MONDAYS
      </Link>
      <nav className="flex gap-4 text-sm text-gray-500 items-center">
        <Link href="/" className="hover:text-gray-900">
          Leaderboard
        </Link>
        {status === "loading" || (status === "authenticated" && hasAgent === false && !checkedAgent) ? (
          <span className="text-gray-300">...</span>
        ) : session?.user ? (
          <div className="flex items-center gap-2">
            {hasAgent ? (
              <Link href="/my-agent" className="hover:text-gray-900">
                My Agent
              </Link>
            ) : (
              <Link href="/submit" className="hover:text-gray-900">
                Submit
              </Link>
            )}
            <span className="text-gray-300">|</span>
            <span className="text-gray-700 text-sm">
              {session.user.name || session.user.email}
            </span>
            <button
              onClick={() => signOut()}
              className="text-sm text-gray-500 hover:text-gray-900"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn("github", { callbackUrl: "/" })}
            className="bg-gray-900 text-white px-3 py-1 text-xs font-semibold"
          >
            Sign in with GitHub
          </button>
        )}
      </nav>
    </div>
  );
}
