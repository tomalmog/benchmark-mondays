import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const userName = session.user.name;
  const userEmail = session.user.email;

  const user = await prisma.user.findFirst({
    where: {
      OR: [
        ...(userEmail ? [{ githubLogin: userEmail }] : []),
        ...(userName ? [{ githubLogin: userName }] : []),
      ],
    },
  });

  if (!user) {
    return NextResponse.json({ error: "User not found" }, { status: 404 });
  }

  const competition = await prisma.competition.findFirst({
    where: { status: { in: ["active", "completed"] } },
    orderBy: { createdAt: "desc" },
  });

  if (!competition) {
    return NextResponse.json({ error: "No competition" }, { status: 404 });
  }

  const agent = await prisma.agent.findFirst({
    where: { userId: user.id, competitionId: competition.id },
    include: {
      portfolios: { where: { competitionId: competition.id }, take: 1 },
    },
  });

  if (!agent) {
    return NextResponse.json({ error: "No agent" }, { status: 404 });
  }

  const portfolio = agent.portfolios[0];
  const totalValue = portfolio ? Number(portfolio.totalValue) : 100000;
  const cash = portfolio ? Number(portfolio.cash) : 100000;
  const holdings = portfolio ? (portfolio.holdings as Record<string, number>) : {};

  const tradeCount = await prisma.action.count({
    where: { agentId: agent.id, actionType: { in: ["buy", "sell"] }, rejected: false },
  });

  const recentTrades = await prisma.action.findMany({
    where: { agentId: agent.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return NextResponse.json({
    id: agent.id,
    name: agent.name,
    totalValue,
    cash,
    pnl: totalValue - 100000,
    holdings,
    tradeCount,
    totalInferences: agent.totalInferences,
    recentTrades: recentTrades.map((t) => ({
      actionType: t.actionType,
      ticker: t.ticker,
      quantity: t.quantity,
      price: t.price ? Number(t.price) : null,
      rejected: t.rejected,
      rejectionReason: t.rejectionReason,
      createdAt: t.createdAt.toISOString(),
    })),
  });
}
