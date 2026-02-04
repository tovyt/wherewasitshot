"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";

const STATUS_MESSAGES: Record<string, string> = {
  missing: "Missing login token. Please request a new login link.",
  invalid: "That login link is invalid or has already been used.",
  expired: "That login link has expired. Please request a new one.",
  error: "Something went wrong verifying your login link."
};

export default function VerifyClientPage() {
  const params = useSearchParams();
  const status = params.get("status") ?? "error";
  const message = STATUS_MESSAGES[status] ?? STATUS_MESSAGES.error;

  return (
    <main>
      <div className="card">
        <h1>Login link issue</h1>
        <p className="muted">{message}</p>
        <Link href="/">Return to home</Link>
      </div>
    </main>
  );
}
