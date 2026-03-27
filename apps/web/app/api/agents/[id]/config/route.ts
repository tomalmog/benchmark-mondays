import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const { id } = await params;
  const agent = await prisma.agent.findUnique({ where: { id } });

  if (!agent) {
    return NextResponse.json({ error: "Agent not found" }, { status: 404 });
  }

  // Only the owner can see the config (it contains their strategy)
  const userName = session.user.name;
  const userEmail = session.user.email;
  const user = await prisma.user.findFirst({
    where: { OR: [...(userEmail ? [{ githubLogin: userEmail }] : []), ...(userName ? [{ githubLogin: userName }] : [])] },
  });

  if (!user || agent.userId !== user.id) {
    return NextResponse.json({ error: "Not your agent" }, { status: 403 });
  }

  const config = agent.config as Record<string, unknown>;
  return NextResponse.json({
    systemPrompt: config.systemPrompt || "",
    temperature: config.temperature ?? 0.7,
    topP: config.topP ?? 0.9,
    maxTokens: config.maxTokens ?? 256,
    repetitionPenalty: config.repetitionPenalty ?? 1.1,
  });
}
