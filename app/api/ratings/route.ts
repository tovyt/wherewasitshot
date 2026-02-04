import { NextRequest, NextResponse } from "next/server";
import { getDbPool } from "../../../lib/db";
import { getUserIdFromRequest } from "../../../lib/auth";

export const runtime = "nodejs";

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Login required to rate estimates." }, { status: 401 });
  }

  const body = (await request.json()) as {
    estimateId?: number;
    score?: number;
    comment?: string;
  };

  const estimateId = Number(body.estimateId);
  const score = Number(body.score);
  const comment = body.comment?.trim() ?? null;

  if (Number.isNaN(estimateId) || ![-1, 1].includes(score)) {
    return NextResponse.json(
      { error: "Invalid payload. Required: estimateId and score (-1 or 1)." },
      { status: 400 }
    );
  }

  const pool = getDbPool();
  if (!pool) {
    return NextResponse.json(
      { error: "Database not configured. Set DATABASE_URL in .env.local." },
      { status: 500 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const userResult = await client.query<{ reputation: string }>(
      `SELECT reputation FROM users WHERE id = $1`,
      [userId]
    );
    const reputation = Number(userResult.rows[0]?.reputation ?? 0);
    const weight = Math.min(3, Math.max(0.5, 1 + reputation / 10));

    await client.query(
      `
        INSERT INTO estimate_ratings (estimate_id, user_id, score, weight, comment)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (estimate_id, user_id)
        DO UPDATE SET
          score = EXCLUDED.score,
          weight = EXCLUDED.weight,
          comment = EXCLUDED.comment,
          created_at = NOW()
      `,
      [estimateId, userId, score, weight, comment]
    );

    const updateResult = await client.query<{ score: string }>(
      `
        UPDATE estimates
        SET score = COALESCE((
          SELECT SUM(score * weight)::numeric
          FROM estimate_ratings
          WHERE estimate_id = $1
        ), 0),
        updated_at = NOW()
        WHERE id = $1
        RETURNING score
      `,
      [estimateId]
    );

    const ratingStats = await client.query<{ count: string; weighted: string }>(
      `
        SELECT COUNT(*)::numeric AS count,
               COALESCE(SUM(score * weight), 0)::numeric AS weighted
        FROM estimate_ratings
        WHERE estimate_id = $1
      `,
      [estimateId]
    );

    const ratingCount = Number(ratingStats.rows[0]?.count ?? 0);
    const weighted = Number(ratingStats.rows[0]?.weighted ?? 0);

    const statusResult = await client.query<{ status: string; created_by: number | null }>(
      `SELECT status, created_by FROM estimates WHERE id = $1`,
      [estimateId]
    );

    const status = statusResult.rows[0]?.status;
    const createdBy = statusResult.rows[0]?.created_by ?? null;

    if (ratingCount >= 3 && weighted >= 3 && status !== "confirmed") {
      await client.query(
        `
          UPDATE estimates
          SET status = 'confirmed',
              updated_at = NOW(),
              confirmed_at = COALESCE(confirmed_at, NOW())
          WHERE id = $1
        `,
        [estimateId]
      );
      if (createdBy) {
        await client.query(
          `UPDATE users SET reputation = reputation + 1 WHERE id = $1`,
          [createdBy]
        );
      }
    } else if (ratingCount >= 3 && weighted <= -3 && status !== "rejected") {
      await client.query(
        `
          UPDATE estimates
          SET status = 'rejected',
              updated_at = NOW()
          WHERE id = $1
        `,
        [estimateId]
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      estimateId,
      score: Number(updateResult.rows[0]?.score ?? 0),
      weighted,
      ratingCount
    });
  } catch (error) {
    await client.query("ROLLBACK");
    return NextResponse.json(
      { error: (error as Error).message ?? "Database error." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}
