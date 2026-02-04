import { NextRequest, NextResponse } from "next/server";
import { queryDb } from "../../../lib/db";

export const runtime = "nodejs";

type SeedItem = {
  title: string;
  wikipedia_title?: string;
};

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const query = (searchParams.get("q") ?? "").trim().toLowerCase();

  if (!query) {
    return NextResponse.json({ items: [] });
  }

  try {
    const { rows } = await queryDb<SeedItem>(
      `
        SELECT title, wikipedia_title
        FROM films
        WHERE title ILIKE $1 OR wikipedia_title ILIKE $1
        ORDER BY search_score DESC NULLS LAST, title ASC
        LIMIT 12
      `,
      [`%${query}%`]
    );

    return NextResponse.json({ items: rows });
  } catch (error) {
    return NextResponse.json(
      { error: (error as Error).message ?? "Database error." },
      { status: 500 }
    );
  }
}
