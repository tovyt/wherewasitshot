import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { setSessionCookie } from "../../../../lib/auth";
import crypto from "crypto";

function getAppUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

function normalizeHandle(email: string) {
  const local = email.split("@")[0] ?? "user";
  const cleaned = local.toLowerCase().replace(/[^a-z0-9_]/g, "_");
  const trimmed = cleaned.replace(/^_+|_+$/g, "");
  if (trimmed.length >= 3) {
    return trimmed.slice(0, 30);
  }
  return "user";
}

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const token = new URL(request.url).searchParams.get("token");
  if (!token) {
    return NextResponse.redirect(`${getAppUrl()}/auth/verify?status=missing`);
  }

  const tokenHashHex = crypto.createHash("sha256").update(token).digest("hex");

  try {
    const tokenResult = await queryDb<{
      id: number;
      email: string;
      expires_at: string;
      consumed_at: string | null;
    }>(
      `
        SELECT id, email, expires_at, consumed_at
        FROM login_tokens
        WHERE token_hash = $1
        LIMIT 1
      `,
      [tokenHashHex]
    );

    const tokenRow = tokenResult.rows[0];
    if (!tokenRow) {
      return NextResponse.redirect(`${getAppUrl()}/auth/verify?status=invalid`);
    }
    if (tokenRow.consumed_at) {
      return NextResponse.redirect(`${getAppUrl()}/auth/verify?status=invalid`);
    }
    if (new Date(tokenRow.expires_at) <= new Date()) {
      return NextResponse.redirect(`${getAppUrl()}/auth/verify?status=expired`);
    }

    await queryDb(`UPDATE login_tokens SET consumed_at = NOW() WHERE id = $1`, [tokenRow.id]);

    const existing = await queryDb<{ id: number; handle: string; reputation: string }>(
      `SELECT id, handle, reputation FROM users WHERE email = $1`,
      [tokenRow.email]
    );

    let user = existing.rows[0];
    if (!user) {
      const base = normalizeHandle(tokenRow.email);
      let candidate = base;
      for (let i = 0; i < 20; i += 1) {
        try {
          const result = await queryDb<{ id: number; handle: string; reputation: string }>(
            `INSERT INTO users (handle, email) VALUES ($1, $2) RETURNING id, handle, reputation`,
            [candidate, tokenRow.email]
          );
          user = result.rows[0];
          break;
        } catch (error) {
          const message = (error as { code?: string }).code ?? "";
          if (message !== "23505") {
            throw error;
          }
          const suffix = i + 1;
          const suffixText = String(suffix);
          candidate = `${base.slice(0, 30 - suffixText.length)}${suffixText}`;
        }
      }
    }

    if (!user) {
      return NextResponse.redirect(`${getAppUrl()}/auth/verify?status=error`);
    }

    const response = NextResponse.redirect(`${getAppUrl()}/profile?login=success`);
    setSessionCookie(response, user.id);
    return response;
  } catch (error) {
    return NextResponse.redirect(`${getAppUrl()}/auth/verify?status=error`);
  }
}
