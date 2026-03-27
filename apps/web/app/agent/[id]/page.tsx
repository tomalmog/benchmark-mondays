import { prisma } from "@/lib/db";
import { notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import Link from "next/link";

export const dynamic = "force-dynamic";

interface PageProps {
  params: Promise<{ id: string }>;
}

export default async function AgentDetailPage({ params }: PageProps) {
  const { id } = await params;

  const agent = await prisma.agent.findUnique({
    where: { id },
    include: {
      user: true,
      portfolios: { take: 1 },
      competition: true,
    },
  });

  if (!agent) notFound();

  const isPoker = agent.competition.arenaType === "poker";
  const portfolio = agent.portfolios[0];
  const totalValue = portfolio ? Number(portfolio.totalValue) : 100000;
  const cash = portfolio ? Number(portfolio.cash) : 100000;
  const pnl = totalValue - 100000;

  // Check ownership
  const session = await getServerSession();
  const userName = session?.user?.name;
  const userEmail = session?.user?.email;
  let isOwner = false;
  if (userName || userEmail) {
    const currentUser = await prisma.user.findFirst({
      where: { OR: [...(userEmail ? [{ githubLogin: userEmail }] : []), ...(userName ? [{ githubLogin: userName }] : [])] },
    });
    isOwner = currentUser?.id === agent.userId;
  }

  // Action counts
  const actionCounts = await prisma.action.groupBy({
    by: ["actionType"],
    where: { agentId: id, rejected: false },
    _count: true,
  });
  const countMap: Record<string, number> = Object.fromEntries(actionCounts.map((a: { actionType: string; _count: number }) => [a.actionType, a._count]));

  // Recent actions
  const actions = await prisma.action.findMany({
    where: { agentId: id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <main className="max-w-4xl mx-auto p-6">
      <Link href="/" className="text-sm text-gray-400 hover:text-gray-900 mb-4 block">
        &larr; Back to leaderboard
      </Link>

      <div className="border border-gray-200 bg-white p-6 mb-4">
        <div className="flex justify-between items-center">
          <h1 className="text-xl font-bold">
            {agent.name}{" "}
            <span className="font-normal text-sm text-gray-400">
              by @{agent.user.githubLogin}
            </span>
          </h1>
          {isOwner && (
            <Link href="/agent/edit" className="text-xs bg-gray-100 border border-gray-300 px-3 py-1 hover:bg-gray-200">
              Edit Config
            </Link>
          )}
        </div>

        {isPoker ? (
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
              <div className="text-xl font-bold">{countMap["raise"] || 0}</div>
              <div className="text-xs text-gray-400 uppercase mt-1">Raises</div>
            </div>
            <div className="border border-gray-100 p-3 text-center">
              <div className="text-xl font-bold">{countMap["fold"] || 0}</div>
              <div className="text-xs text-gray-400 uppercase mt-1">Folds</div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
            <div className="border border-gray-100 p-3 text-center">
              <div className={`text-xl font-bold ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
                {pnl >= 0 ? "+" : ""}${pnl.toLocaleString("en-US", { maximumFractionDigits: 0 })}
              </div>
              <div className="text-xs text-gray-400 uppercase mt-1">Total P&L</div>
            </div>
            <div className="border border-gray-100 p-3 text-center">
              <div className="text-xl font-bold">{(countMap["buy"] || 0) + (countMap["sell"] || 0)}</div>
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

        {/* Holdings (stock exchange only) */}
        {!isPoker && portfolio && Object.keys((portfolio.holdings as Record<string, number>) || {}).length > 0 && (
          <div className="mt-4 border-t border-gray-100 pt-3">
            <div className="text-xs font-bold uppercase text-gray-400 mb-2">Holdings</div>
            <div className="flex flex-wrap gap-2">
              {Object.entries(portfolio.holdings as Record<string, number>).map(([ticker, qty]) => (
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
          {isPoker ? "Action Log" : "Trade Log"}
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
                    {isPoker ? (
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
                        {action.rejectionReason && <span className="text-gray-400"> — {action.rejectionReason}</span>}
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
                        {action.rejectionReason && <span className="text-gray-400"> — {action.rejectionReason}</span>}
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
