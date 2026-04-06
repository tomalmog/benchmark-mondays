import { NextResponse } from "next/server";
import { fetchEngine } from "@/lib/engine";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const response = await fetchEngine("/api/competition", { cache: "no-store" });
    const body = await response.text();

    return new NextResponse(body, {
      status: response.status,
      headers: { "content-type": "application/json" },
    });
  } catch (error) {
    console.error("[api/competition]", error);
    return NextResponse.json(
      { error: "Failed to reach engine API" },
      { status: 502 }
    );
  }
}
