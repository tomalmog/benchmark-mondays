import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { fetchEngine } from "@/lib/engine";

const MAX_PROMPT_LENGTH = 10_000;
const MAX_EXAMPLES_LENGTH = 1_000_000;

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession();
    if (!session?.user) {
      return NextResponse.json({ error: "Sign in with GitHub first." }, { status: 401 });
    }

    const body = await request.json();
    const { name, config } = body;
    const githubLogin =
      (session.user as { githubLogin?: string }).githubLogin ||
      session.user.name ||
      session.user.email;

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return NextResponse.json({ error: "Agent name is required" }, { status: 400 });
    }

    if (!config || !config.systemPrompt || config.systemPrompt.trim().length === 0) {
      return NextResponse.json({ error: "System prompt is required" }, { status: 400 });
    }

    if (config.systemPrompt.length > MAX_PROMPT_LENGTH) {
      return NextResponse.json({ error: "System prompt must be under 10,000 characters" }, { status: 400 });
    }

    const validatedConfig = {
      systemPrompt: config.systemPrompt.trim(),
      examplesText:
        typeof config.examplesText === "string"
          ? config.examplesText.slice(0, MAX_EXAMPLES_LENGTH)
          : "",
      temperature: Math.max(0, Math.min(2, Number(config.temperature) || 0.7)),
      topP: Math.max(0.1, Math.min(1, Number(config.topP) || 0.9)),
      maxTokens: Math.max(64, Math.min(512, Math.floor(Number(config.maxTokens) || 256))),
      repetitionPenalty: Math.max(1, Math.min(2, Number(config.repetitionPenalty) || 1.1)),
    };

    const response = await fetchEngine("/api/agents/submit", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: name.trim(),
        config: validatedConfig,
        githubLogin,
        githubEmail: session.user.email || null,
      }),
    });

    const responseBody = await response.text();
    return new NextResponse(responseBody, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    console.error("[submit] Error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}
