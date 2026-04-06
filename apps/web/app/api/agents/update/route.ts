import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { fetchEngine } from "@/lib/engine";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const body = await request.json();
    const { agentId, config } = body;
    const githubLogin =
      (session.user as { githubLogin?: string }).githubLogin ||
      session.user.name ||
      session.user.email;

    if (!agentId || !config?.systemPrompt || !githubLogin) {
      return NextResponse.json({ error: "Missing agent ID or system prompt" }, { status: 400 });
    }

    const validatedConfig = {
      systemPrompt: config.systemPrompt.trim().slice(0, 10000),
      examplesText: String(config.examplesText || "").slice(0, 1000000),
      temperature: Math.max(0, Math.min(2, Number(config.temperature) || 0.7)),
      topP: Math.max(0.1, Math.min(1, Number(config.topP) || 0.9)),
      maxTokens: Math.max(64, Math.min(512, Math.floor(Number(config.maxTokens) || 256))),
      repetitionPenalty: Math.max(1, Math.min(2, Number(config.repetitionPenalty) || 1.1)),
    };

    const response = await fetchEngine("/api/agents/update", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        agentId,
        config: validatedConfig,
        githubLogin,
      }),
    });

    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[update] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
