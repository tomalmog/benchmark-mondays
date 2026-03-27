import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";

const MAX_PROMPT_LENGTH = 10_000;
const MAX_EXAMPLES_LENGTH = 1_000_000;

export async function POST(request: NextRequest) {
  try {
    // Require authentication
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Sign in with GitHub first." }, { status: 401 });
    }

    const body = await request.json();
    const { name, config } = body;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Agent name is required" }, { status: 400 });
    }

    if (!config || !config.systemPrompt || config.systemPrompt.trim().length === 0) {
      return NextResponse.json({ error: "System prompt is required" }, { status: 400 });
    }

    if (config.systemPrompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ error: "System prompt must be under 10,000 characters" }, { status: 400 });
    }

    const examplesText = typeof config.examplesText === "string"
      ? config.examplesText.slice(0, MAX_EXAMPLES_LENGTH)
      : "";

    const validatedConfig = {
      systemPrompt: config.systemPrompt.trim(),
      examplesText,
      temperature: Math.max(0, Math.min(2, Number(config.temperature) || 0.7)),
      topP: Math.max(0.1, Math.min(1, Number(config.topP) || 0.9)),
      maxTokens: Math.max(64, Math.min(512, Math.floor(Number(config.maxTokens) || 256))),
      repetitionPenalty: Math.max(1, Math.min(2, Number(config.repetitionPenalty) || 1.1)),
    };

    const competition = await prisma.competition.findFirst({
      where: { status: { in: ["active", "draft"] } },
      orderBy: { createdAt: "desc" },
    });

    if (!competition) {
      return NextResponse.json({ error: "No active competition." }, { status: 400 });
    }

    const agentCount = await prisma.agent.count({ where: { competitionId: competition.id } });
    if (agentCount >= competition.maxAgents) {
      return NextResponse.json({ error: "Competition is full." }, { status: 400 });
    }

    // Find user by their GitHub profile name/email
    const userEmail = session.user.email;
    const userName = session.user.name;
    let user = await prisma.user.findFirst({
      where: {
        OR: [
          ...(userEmail ? [{ githubLogin: userEmail }] : []),
          ...(userName ? [{ githubLogin: userName }] : []),
        ],
      },
    });

    if (!user) {
      // User signed in but doesn't exist yet — create from session
      user = await prisma.user.create({
        data: {
          githubId: userEmail || userName || `user-${Date.now()}`,
          githubLogin: userName || userEmail || "unknown",
        },
      });
    }

    // Check one agent per user per competition
    const existingAgent = await prisma.agent.findFirst({
      where: { userId: user.id, competitionId: competition.id },
    });

    if (existingAgent) {
      return NextResponse.json({ error: "You already have an agent in this competition." }, { status: 409 });
    }

    const agent = await prisma.agent.create({
      data: { userId: user.id, competitionId: competition.id, name: name.trim(), config: validatedConfig },
    });

    await prisma.portfolio.create({
      data: { agentId: agent.id, competitionId: competition.id, cash: 100000, holdings: {}, totalValue: 100000 },
    });

    return NextResponse.json({ id: agent.id, name: agent.name, message: "Agent submitted." });
  } catch (err) {
    console.error("[submit] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
