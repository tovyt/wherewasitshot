import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";

const SESSION_COOKIE = "flf_session";
const SESSION_TTL_DAYS = 30;

function getSessionSecret(): string {
  const secret = process.env.SESSION_SECRET;
  if (!secret) {
    throw new Error("SESSION_SECRET is not set.");
  }
  return secret;
}

function sign(value: string): string {
  const secret = getSessionSecret();
  return crypto.createHmac("sha256", secret).update(value).digest("hex");
}

export function encodeSession(userId: number): string {
  const payload = `${userId}`;
  const signature = sign(payload);
  return `${payload}.${signature}`;
}

export function decodeSession(raw: string | undefined | null): number | null {
  if (!raw) {
    return null;
  }
  const parts = raw.split(".");
  if (parts.length !== 2) {
    return null;
  }
  const [payload, signature] = parts;
  if (sign(payload) !== signature) {
    return null;
  }
  const userId = Number(payload);
  if (Number.isNaN(userId)) {
    return null;
  }
  return userId;
}

export function getUserIdFromRequest(request: NextRequest): number | null {
  const cookie = request.cookies.get(SESSION_COOKIE)?.value;
  return decodeSession(cookie);
}

export function setSessionCookie(response: NextResponse, userId: number) {
  response.cookies.set(SESSION_COOKIE, encodeSession(userId), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: SESSION_TTL_DAYS * 24 * 60 * 60,
    path: "/"
  });
}

export function clearSessionCookie(response: NextResponse) {
  response.cookies.set(SESSION_COOKIE, "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 0,
    path: "/"
  });
}
