import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../lib/db";
import { getUserIdFromRequest } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json({ error: "Login required." }, { status: 401 });
  }

  try {
    const userResult = await queryDb<{
      id: number;
      handle: string;
      reputation: string;
      created_at: string;
    }>(`SELECT id, handle, reputation, created_at FROM users WHERE id = $1`, [userId]);

    const user = userResult.rows[0];
    if (!user) {
      return NextResponse.json({ error: "User not found." }, { status: 404 });
    }

    const statsResult = await queryDb<{
      estimate_count: string;
      confirmed_count: string;
      rejected_count: string;
      pending_count: string;
      avg_score: string;
      ratings_count: string;
    }>(
      `
        SELECT
          COUNT(e.id)::numeric AS estimate_count,
          COALESCE(SUM(CASE WHEN e.status = 'confirmed' THEN 1 ELSE 0 END), 0)::numeric AS confirmed_count,
          COALESCE(SUM(CASE WHEN e.status = 'rejected' THEN 1 ELSE 0 END), 0)::numeric AS rejected_count,
          COALESCE(SUM(CASE WHEN e.status = 'estimated' THEN 1 ELSE 0 END), 0)::numeric AS pending_count,
          COALESCE(AVG(e.score), 0)::numeric AS avg_score,
          (
            SELECT COUNT(*)::numeric
            FROM estimate_ratings r
            WHERE r.user_id = $1
          ) AS ratings_count
        FROM estimates e
        WHERE e.created_by = $1
      `,
      [userId]
    );

    const estimateRows = await queryDb<{
      id: number;
      status: "estimated" | "confirmed" | "rejected";
      score: string;
      created_at: string;
      confirmed_at: string | null;
      timestamp_start: number;
      timestamp_end: number;
      film_title: string;
    }>(
      `
        SELECT e.id,
               e.status,
               e.score,
               e.created_at,
               e.confirmed_at,
               s.timestamp_start,
               s.timestamp_end,
               f.title AS film_title
        FROM estimates e
        JOIN shots s ON s.id = e.shot_id
        JOIN films f ON f.id = s.film_id
        WHERE e.created_by = $1
        ORDER BY e.created_at DESC
        LIMIT 10
      `,
      [userId]
    );

    const ratingRows = await queryDb<{
      id: number;
      score: number;
      weight: string;
      comment: string | null;
      created_at: string;
      film_title: string;
      timestamp_start: number;
      timestamp_end: number;
      status: string;
    }>(
      `
        SELECT r.id,
               r.score,
               r.weight,
               r.comment,
               r.created_at,
               f.title AS film_title,
               s.timestamp_start,
               s.timestamp_end,
               e.status
        FROM estimate_ratings r
        JOIN estimates e ON e.id = r.estimate_id
        JOIN shots s ON s.id = e.shot_id
        JOIN films f ON f.id = s.film_id
        WHERE r.user_id = $1
        ORDER BY r.created_at DESC
        LIMIT 10
      `,
      [userId]
    );

    const reputationEvents = await queryDb<{
      id: number;
      confirmed_at: string;
      film_title: string;
      timestamp_start: number;
      timestamp_end: number;
    }>(
      `
        SELECT e.id,
               e.confirmed_at,
               f.title AS film_title,
               s.timestamp_start,
               s.timestamp_end
        FROM estimates e
        JOIN shots s ON s.id = e.shot_id
        JOIN films f ON f.id = s.film_id
        WHERE e.created_by = $1
          AND e.status = 'confirmed'
          AND e.confirmed_at IS NOT NULL
        ORDER BY e.confirmed_at DESC
        LIMIT 10
      `,
      [userId]
    );

    const stats = statsResult.rows[0];

    return NextResponse.json({
      user: {
        id: user.id,
        handle: user.handle,
        reputation: Number(user.reputation),
        created_at: user.created_at
      },
      stats: {
        estimate_count: Number(stats?.estimate_count ?? 0),
        confirmed_count: Number(stats?.confirmed_count ?? 0),
        rejected_count: Number(stats?.rejected_count ?? 0),
        pending_count: Number(stats?.pending_count ?? 0),
        avg_score: Number(stats?.avg_score ?? 0),
        ratings_count: Number(stats?.ratings_count ?? 0)
      },
      estimates: estimateRows.rows.map((row) => ({
        id: row.id,
        film_title: row.film_title,
        status: row.status,
        score: Number(row.score),
        created_at: row.created_at,
        confirmed_at: row.confirmed_at,
        timestamp_start: row.timestamp_start,
        timestamp_end: row.timestamp_end
      })),
      ratings: ratingRows.rows.map((row) => ({
        id: row.id,
        film_title: row.film_title,
        score: row.score,
        weight: Number(row.weight),
        comment: row.comment,
        created_at: row.created_at,
        status: row.status,
        timestamp_start: row.timestamp_start,
        timestamp_end: row.timestamp_end
      })),
      reputation_events: reputationEvents.rows.map((row) => ({
        id: row.id,
        film_title: row.film_title,
        confirmed_at: row.confirmed_at,
        timestamp_start: row.timestamp_start,
        timestamp_end: row.timestamp_end
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? "Database error." },
      { status: 500 }
    );
  }
}
