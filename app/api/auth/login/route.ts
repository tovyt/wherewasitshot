import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../../lib/db";
import { createLoginToken } from "../../../../lib/login-token";
import { sendLoginEmail } from "../../../../lib/email";

export const runtime = "nodejs";

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function getAppUrl() {
  return process.env.APP_URL ?? "http://localhost:3000";
}

export async function POST(request: NextRequest) {
  const body = (await request.json()) as { email?: string };
  const rawEmail = body.email?.trim().toLowerCase() ?? "";

  if (!EMAIL_REGEX.test(rawEmail)) {
    return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
  }

  const { token, tokenHash } = createLoginToken();
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000);

  try {
    await queryDb(
      `
        INSERT INTO login_tokens (email, token_hash, expires_at)
        VALUES ($1, $2, $3)
      `,
      [rawEmail, tokenHash, expiresAt]
    );

    const loginLink = `${getAppUrl()}/api/auth/verify?token=${token}`;
    await sendLoginEmail({ email: rawEmail, loginLink });

    return NextResponse.json({ ok: true });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? "Unable to send login email." },
      { status: 500 }
    );
  }
}
