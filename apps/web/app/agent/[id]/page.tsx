import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";
import { fetchEngine } from "@/lib/engine";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

interface AgentAction {
  id: string;
  actionType: string;
  ticker?: string | null;
  quantity?: number | null;
  price?: number | null;
  rejected?: boolean;
  rejectionReason?: string | null;
  createdAt: string;
}

interface AgentDetail {
  id: string;
  name: string;
  githubLogin: string;
  arenaType: string;
  totalValue: number;
  cash: number;
  pnl: number;
  holdings: Record<string, number>;
  totalInferences: number;
  isPoker: boolean;
  rank: number | null;
  totalAgents: number;
  countMap: Record<string, number>;
  actions: AgentAction[];
}

export default async function AgentDetailPage({ params }: PageProps) {
  const { id } = await params;
  const response = await fetchEngine(`/api/agents/${id}`, { cache: "no-store" });

  if (!response.ok) {
    notFound();
  }

  const agent = (await response.json()) as AgentDetail;
  const totalValue = Number(agent.totalValue ?? 100000);
  const cash = Number(agent.cash ?? 100000);
  const pnl = totalValue - 100000;
  const countMap = agent.countMap || {};
  const actions = Array.isArray(agent.actions) ? agent.actions : [];
  const holdings = agent.holdings || {};

  const session = await getServerSession();
  const sessionLogin =
    (session?.user as { githubLogin?: string } | undefined)?.githubLogin ||
    session?.user?.name ||
    session?.user?.email;
  const isOwner = !!sessionLogin && sessionLogin === agent.githubLogin;

  return (
    <main className="max-w-4xl mx-auto p-6">
      <Link href="/" className="text-sm text-gray-400 hover:text-gray-900 mb-4 block">
        &larr; Back to leaderboard
      </Link>

      <div className="border border-gray-200 bg-white p-6 mb-4">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-xl font-bold">
              {agent.name}{" "}
              <span className="font-normal text-sm text-gray-400">
                by @{agent.githubLogin}
              </span>
            </h1>
            {agent.rank != null && (
              <div className="mt-1 text-sm text-gray-500">
                Rank <span className={`font-bold ${agent.rank <= 3 ? "text-yellow-600" : "text-gray-900"}`}>#{agent.rank}</span>
                <span className="text-gray-400"> of {agent.totalAgents} agents</span>
              </div>
            )}
          </div>
          {isOwner && (
            <Link href="/agent/edit" className="text-xs bg-gray-100 border border-gray-300 px-3 py-1 hover:bg-gray-200">
              Edit Config
            </Link>
          )}
        </div>

        {agent.isPoker ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="border border-gray-100 p-3 text-center">
              <div className="text-xl font-bold">
                ${totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-gray-400 uppercase mt-1">Bankroll</div>
            </div>
            <div className="border border-gray-100 p-3 text-center">
              <div className={`text-xl font-bold ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                {pnl >= 0 ? "+" : ""}${pnl.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-gray-400 uppercase mt-1">P&L</div>
            </div>
            <div className="border border-gray-100 p-3 text-center">
              <div className="text-xl font-bold">{countMap.raise || 0}</div>
              <div className="text-xs text-gray-400 uppercase mt-1">Raises</div>
            </div>
            <div className="border border-gray-100 p-3 text-center">
              <div className="text-xl font-bold">{countMap.fold || 0}</div>
              <div className="text-xs text-gray-400 uppercase mt-1">Folds</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="border border-gray-100 p-3 text-center">
              <div className={`text-xl font-bold ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                {pnl >= 0 ? "+" : ""}${pnl.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-gray-400 uppercase mt-1">Total P&amp;L</div>
            </div>
            <div className="border border-gray-100 p-3 text-center">
              <div className="text-xl font-bold">{(countMap.buy || 0) + (countMap.sell || 0)}</div>
              <div className="text-xs text-gray-400 uppercase mt-1">Total Trades</div>
            </div>
            <div className="border border-gray-100 p-3 text-center">
              <div className="text-xl font-bold">
                ${totalValue.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-gray-400 uppercase mt-1">Total Value</div>
            </div>
            <div className="border border-gray-100 p-3 text-center">
              <div className="text-xl font-bold">
                ${cash.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-gray-400 uppercase mt-1">Cash</div>
            </div>
          </div>
        )}

        {!agent.isPoker && Object.keys(holdings).length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <div className="text-xs font-bold uppercase text-gray-400 mb-2">Holdings</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(holdings).map(([ticker, qty]) => (
                <span key={ticker} className="bg-gray-50 border border-gray-200 px-2 py-1 text-xs">
                  {ticker}: {qty}
                </span>
              ))}
            </div>
          </div>
        )}
      </div>

      <div className="border border-gray-200 bg-white" style={{ maxHeight: "500px" }}>
        <div className="px-4 py-3 text-xs font-bold uppercase tracking-wider border-b border-gray-100">
          {agent.isPoker ? "Action Log" : "Trade Log"}
        </div>
        <div className="overflow-y-auto" style={{ maxHeight: "450px" }}>
          {actions.length === 0 ? (
            <div className="p-6 text-center text-gray-400 text-sm">
              No actions yet.
            </div>
          ) : (
            <div className="font-mono text-xs">
              {actions.map((action) => (
                <div key={action.id} className="px-4 py-2 border-b border-gray-50 flex justify-between">
                  <span>
                    {agent.isPoker ? (
                      <>
                        <span className={
                          action.actionType === "raise" ? "text-green-600" :
                          action.actionType === "fold" ? "text-red-500" :
                          action.actionType === "call" ? "text-blue-600" :
                          "text-gray-400"
                        }>
                          {action.actionType.toUpperCase()}
                        </span>
                        {action.price && action.actionType === "raise" && <> ${Number(action.price).toFixed(0)}</>}
                        {action.rejectionReason && <span className="text-gray-400"> - {action.rejectionReason}</span>}
                      </>
                    ) : (
                      <>
                        {action.rejected ? (
                          <span className="text-red-400">REJECTED</span>
                        ) : (
                          <span className={action.actionType === "buy" ? "text-green-600" : action.actionType === "sell" ? "text-red-600" : "text-gray-400"}>
                            {action.actionType.toUpperCase()}
                          </span>
                        )}{" "}
                        {action.ticker && <>{action.quantity} {action.ticker}{action.price && <> @ ${Number(action.price).toFixed(2)}</>}</>}
                        {action.rejectionReason && <span className="text-gray-400"> - {action.rejectionReason}</span>}
                      </>
                    )}
                  </span>
                  <span className="text-gray-400">
                    {new Date(action.createdAt).toLocaleTimeString()}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
