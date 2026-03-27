import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const competition = await prisma.competition.findFirst({
    where: { status: { in: ["active", "completed"] } },
    orderBy: { createdAt: "desc" },
  });

  if (!competition) {
    return NextResponse.json(null);
  }

  const agentCount = await prisma.agent.count({
    where: { competitionId: competition.id },
  });

  const portfolios = await prisma.portfolio.findMany({
    where: { competitionId: competition.id },
    orderBy: { totalValue: "desc" },
    take: 10,
    include: {
      agent: { include: { user: true } },
    },
  });

  const tradeCounts = await prisma.action.groupBy({
    by: ["agentId"],
    where: {
      competitionId: competition.id,
      actionType: { in: ["buy", "sell"] },
      rejected: false,
    },
    _count: true,
  });

  const tradeCountMap = new Map(
    tradeCounts.map((tc) => [tc.agentId, tc._count])
  );

  const leaderboardEntries = portfolios.map((p, i) => {
    const totalValue = Number(p.totalValue);
    const cash = Number(p.cash);
    const invested = totalValue - cash;
    return {
      id: p.agent.id,
      name: p.agent.name,
      githubLogin: p.agent.user.githubLogin,
      totalValue,
      cash,
      invested: Math.max(0, invested),
      tradeCount: tradeCountMap.get(p.agentId) || 0,
      rank: i + 1,
    };
  });

  const recentActions = await prisma.action.findMany({
    where: { competitionId: competition.id },
    orderBy: { createdAt: "desc" },
    take: 30,
    include: { agent: true },
  });

  const activityItems = recentActions.map((a) => ({
    id: a.id,
    agentName: a.agent.name,
    actionType: a.actionType,
    ticker: a.ticker,
    quantity: a.quantity,
    price: a.price ? Number(a.price) : null,
    rejected: a.rejected,
    rejectionReason: a.rejectionReason,
    createdAt: a.createdAt.toISOString(),
  }));

  return NextResponse.json({
    competition: {
      name: competition.name,
      arenaType: competition.arenaType,
      startsAt: competition.startsAt.toISOString(),
      endsAt: competition.endsAt.toISOString(),
      currentRound: competition.currentRound,
    },
    agentCount,
    leaderboardEntries,
    activityItems,
  });
}
