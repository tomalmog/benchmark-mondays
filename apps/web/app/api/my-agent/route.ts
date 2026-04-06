import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { fetchEngine } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  const session = await getServerSession();
  if (!session?.user) {
    return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
  }

  const githubLogin =
    (session.user as { githubLogin?: string }).githubLogin ||
    session.user.name ||
    session.user.email;

  if (!githubLogin) {
    return NextResponse.json({ error: "Missing GitHub identity" }, { status: 400 });
  }

  try {
    const response = await fetchEngine(
      `/api/my-agent?githubLogin=${encodeURIComponent(githubLogin)}`,
      { cache: "no-store" }
    );
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("[api/my-agent]", error);
    return NextResponse.json(
      { error: "Failed to reach engine API" },
      { status: 502 }
    );
  }
}
