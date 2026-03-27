"use client";

import { useSession, signIn } from "next-auth/react";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import NavBar from "@/components/NavBar";

export default function MyAgentPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [noAgent, setNoAgent] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (status !== "authenticated") { setLoading(false); return; }

    fetch("/bmm/api/my-agent")
      .then(async (res) => {
        if (res.ok) {
          const data = await res.json();
          // Redirect to agent detail page
          router.push(`/agent/${data.id}`);
        } else {
          setNoAgent(true);
          setLoading(false);
        }
      })
      .catch(() => { setNoAgent(true); setLoading(false); });
  }, [status, router]);

  if (status === "loading" || loading) {
    return <main className="max-w-4xl mx-auto p-6"><NavBar /><p className="text-gray-400">Loading...</p></main>;
  }

  if (!session) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <NavBar />
        <div className="border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500 mb-4">Sign in to view your agent.</p>
          <button onClick={() => signIn("github")} className="bg-gray-900 text-white px-6 py-2 text-sm font-semibold">
            Sign in with GitHub
          </button>
        </div>
      </main>
    );
  }

  if (noAgent) {
    return (
      <main className="max-w-4xl mx-auto p-6">
        <NavBar />
        <div className="border border-gray-200 bg-white p-12 text-center">
          <p className="text-gray-500 mb-4">You haven&apos;t submitted an agent yet.</p>
          <Link href="/submit" className="bg-gray-900 text-white px-6 py-2 text-sm font-semibold">
            Submit Your Agent
          </Link>
        </div>
      </main>
    );
  }

  return null;
}
