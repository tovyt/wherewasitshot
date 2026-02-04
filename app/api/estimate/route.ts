import { NextRequest, NextResponse } from "next/server";
import { getDbPool, queryDb } from "../../../lib/db";
import { parseTimestampToSeconds } from "../../../lib/timestamp";
import { convertTo3wa } from "../../../lib/what3words";
import { getUserIdFromRequest } from "../../../lib/auth";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const title = searchParams.get("title")?.trim() ?? "";
  const timestamp = searchParams.get("timestamp")?.trim() ?? "";

  if (!title || !timestamp) {
    return NextResponse.json(
      { error: "Missing required query parameters: title and timestamp." },
      { status: 400 }
    );
  }

  const seconds = parseTimestampToSeconds(timestamp);
  if (seconds === null) {
    return NextResponse.json(
      { error: "Invalid timestamp. Use HH:MM:SS (or MM:SS)." },
      { status: 400 }
    );
  }

  try {
    const filmResult = await queryDb<{ id: number; title: string; wikipedia_title: string | null }>(
      `
        SELECT id, title, wikipedia_title
        FROM films
        WHERE title ILIKE $1 OR wikipedia_title ILIKE $1
        ORDER BY search_score DESC NULLS LAST, title ASC
        LIMIT 1
      `,
      [`%${title}%`]
    );

    if (filmResult.rows.length === 0) {
      return NextResponse.json({ error: "Film not found." }, { status: 404 });
    }

    const film = filmResult.rows[0];
    const estimateResult = await queryDb<{
      id: number;
      lat: number;
      lng: number;
      w3w: string | null;
      confidence: "low" | "medium" | "high";
      status: "estimated" | "confirmed" | "rejected";
      score: string;
      timestamp_start: number;
      timestamp_end: number;
    }>(
      `
        SELECT e.id,
               e.lat,
               e.lng,
               e.w3w,
               e.confidence,
               e.status,
               e.score,
               s.timestamp_start,
               s.timestamp_end
        FROM shots s
        JOIN estimates e ON e.shot_id = s.id
        WHERE s.film_id = $1
          AND e.status <> 'rejected'
          AND $2 BETWEEN s.timestamp_start AND s.timestamp_end
        ORDER BY (e.status = 'confirmed') DESC,
                 e.score DESC,
                 e.created_at DESC
        LIMIT 1
      `,
      [film.id, seconds]
    );

    if (estimateResult.rows.length === 0) {
      return NextResponse.json(
        { error: "No estimate available for this timestamp yet." },
        { status: 404 }
      );
    }

    const estimate = estimateResult.rows[0];
    let w3w = estimate.w3w;
    if (!w3w) {
      const computed = await convertTo3wa(estimate.lat, estimate.lng);
      if (computed) {
        w3w = computed;
        await queryDb(`UPDATE estimates SET w3w = $1, updated_at = NOW() WHERE id = $2`, [
          computed,
          estimate.id
        ]);
      }
    }
    const evidenceResult = await queryDb<{
      source_type: string;
      source_url: string | null;
      note: string | null;
    }>(
      `
        SELECT source_type, source_url, note
        FROM estimate_evidence
        WHERE estimate_id = $1
        ORDER BY created_at ASC
      `,
      [estimate.id]
    );

    return NextResponse.json({
      title: film.title,
      timestamp,
      isPlaceholder: false,
      estimateId: estimate.id,
      estimate: {
        lat: estimate.lat,
        lng: estimate.lng,
        w3w,
        confidence: estimate.confidence,
        status: estimate.status,
        score: Number(estimate.score),
        timestamp_start: estimate.timestamp_start,
        timestamp_end: estimate.timestamp_end
      },
      evidence: evidenceResult.rows.map((row) => ({
        label: row.source_type,
        detail: row.source_url ? `${row.note ?? ""} ${row.source_url}`.trim() : row.note ?? ""
      }))
    });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? "Database error." },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const userId = getUserIdFromRequest(request);
  if (!userId) {
    return NextResponse.json(
      { error: "Login required to submit an estimate." },
      { status: 401 }
    );
  }

  const body = (await request.json()) as {
    title?: string;
    timestamp?: string;
    lat?: number;
    lng?: number;
    w3w?: string;
    evidence?: { source_type: string; source_url?: string; note?: string }[];
  };

  const title = body.title?.trim() ?? "";
  const timestamp = body.timestamp?.trim() ?? "";
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  let w3w = body.w3w?.trim() ?? null;

  if (!title || !timestamp || Number.isNaN(lat) || Number.isNaN(lng)) {
    return NextResponse.json(
      { error: "Missing or invalid fields. Required: title, timestamp, lat, lng." },
      { status: 400 }
    );
  }

  const seconds = parseTimestampToSeconds(timestamp);
  if (seconds === null) {
    return NextResponse.json(
      { error: "Invalid timestamp. Use HH:MM:SS (or MM:SS)." },
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

  if (!w3w) {
    w3w = await convertTo3wa(lat, lng);
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const filmResult = await client.query<{ id: number; title: string }>(
      `
        SELECT id, title
        FROM films
        WHERE title ILIKE $1 OR wikipedia_title ILIKE $1
        ORDER BY search_score DESC NULLS LAST, title ASC
        LIMIT 1
      `,
      [`%${title}%`]
    );

    if (filmResult.rows.length === 0) {
      await client.query("ROLLBACK");
      return NextResponse.json({ error: "Film not found." }, { status: 404 });
    }

    const film = filmResult.rows[0];

    const shotResult = await client.query<{ id: number }>(
      `
        SELECT id
        FROM shots
        WHERE film_id = $1
          AND $2 BETWEEN timestamp_start AND timestamp_end
        ORDER BY (timestamp_end - timestamp_start) ASC
        LIMIT 1
      `,
      [film.id, seconds]
    );

    let shotId: number;
    if (shotResult.rows.length > 0) {
      shotId = shotResult.rows[0].id;
    } else {
      const defaultEnd = seconds + 2;
      const createdShot = await client.query<{ id: number }>(
        `
          INSERT INTO shots (film_id, timestamp_start, timestamp_end, label)
          VALUES ($1, $2, $3, $4)
          RETURNING id
        `,
        [film.id, seconds, defaultEnd, "User submitted shot"]
      );
      shotId = createdShot.rows[0].id;
    }

    const estimateResult = await client.query<{ id: number }>(
      `
        INSERT INTO estimates (shot_id, lat, lng, w3w, confidence, status, score, created_by)
        VALUES ($1, $2, $3, $4, 'low', 'estimated', 0, $5)
        RETURNING id
      `,
      [shotId, lat, lng, w3w, userId]
    );

    const estimateId = estimateResult.rows[0].id;

    const evidence = Array.isArray(body.evidence) ? body.evidence : [];
    for (const item of evidence) {
      const sourceType = item.source_type?.trim();
      if (!sourceType) {
        continue;
      }
      await client.query(
        `
          INSERT INTO estimate_evidence (estimate_id, source_type, source_url, note)
          VALUES ($1, $2, $3, $4)
        `,
        [estimateId, sourceType, item.source_url?.trim() ?? null, item.note?.trim() ?? null]
      );
    }

    await client.query("COMMIT");

    return NextResponse.json({
      estimateId,
      message: "Estimate submitted."
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
