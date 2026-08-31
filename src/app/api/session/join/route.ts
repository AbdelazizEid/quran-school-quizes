import { NextRequest, NextResponse } from "next/server";
import { joinByCode } from "@/lib/session";
import { getStudent } from "@/lib/student";

export async function POST(req: NextRequest) {
  const body = (await req.json()) as { code?: string; nickname?: string };
  if (!body.code || !body.nickname) {
    return NextResponse.json({ error: "code-and-nickname-required" }, { status: 400 });
  }

  // link the join to a student account when one is signed in (or dev mode)
  const student = await getStudent().catch(() => null);

  const joined = await joinByCode(body.code, body.nickname, student?.id ?? null);
  if (!joined) {
    return NextResponse.json({ error: "session-not-found" }, { status: 404 });
  }
  return NextResponse.json({
    sessionId: joined.session.id,
    participantId: joined.participant.id,
    nickname: joined.participant.nickname,
  });
}
