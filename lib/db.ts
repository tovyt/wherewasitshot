import { Pool, type QueryResultRow } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __dbPool: Pool | undefined;
}

function createPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    return null;
  }

  return new Pool({
    connectionString
  });
}

export function getDbPool(): Pool | null {
  if (process.env.NODE_ENV === "production") {
    return createPool();
  }

  if (!global.__dbPool) {
    global.__dbPool = createPool() ?? undefined;
  }

  return global.__dbPool ?? null;
}

export async function queryDb<T extends QueryResultRow = QueryResultRow>(
  text: string,
  params: unknown[] = []
) {
  const pool = getDbPool();
  if (!pool) {
    throw new Error("Database not configured. Set DATABASE_URL in .env.local.");
  }
  return pool.query<T>(text, params);
}
