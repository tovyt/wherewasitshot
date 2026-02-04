import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { clearSessionCookie, getUserIdFromRequest } from "../../../../lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ user: null });
  }

  try {
    const result = await queryDb<{ id: number; handle: string; reputation: string }>(
      `SELECT id, handle, reputation FROM users WHERE id = $1`,
      [userId]
    );
    const user = result.rows[0];
    if (!user) {
      const response = NextResponse.json({ user: null });
      clearSessionCookie(response);
      return response;
    }

    return NextResponse.json({
      user: {
        id: user.id,
        handle: user.handle,
        reputation: Number(user.reputation)
      }
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? "Database error." },
      { status: 500 }
    );
  }
}
