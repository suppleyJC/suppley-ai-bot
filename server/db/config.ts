/**
 * Database Configuration
 * 
 * This file centralizes all database configuration.
 * To migrate to a dedicated database (PlanetScale, Supabase, Neon, etc.):
 * 
 * 1. Update DATABASE_URL in your environment/secrets
 * 2. If changing dialect (e.g., MySQL → PostgreSQL):
 *    - Update drizzle.config.ts dialect
 *    - Update schema imports from "drizzle-orm/mysql-core" to "drizzle-orm/pg-core"
 *    - Update this file's driver import
 *    - Run `pnpm db:push` to create tables in new database
 * 3. If staying with MySQL (e.g., PlanetScale):
 *    - Just update DATABASE_URL - no code changes needed
 *    - Add `?ssl={"rejectUnauthorized":true}` to connection string if required
 * 
 * Supported databases:
 * - MySQL/TiDB (current): drizzle-orm/mysql2
 * - PlanetScale: drizzle-orm/planetscale-serverless
 * - PostgreSQL: drizzle-orm/node-postgres
 * - Neon: drizzle-orm/neon-http
 * - Supabase: drizzle-orm/postgres-js
 */

import { drizzle } from "drizzle-orm/mysql2";
import { ENV } from "../_core/env";

export type DatabaseInstance = ReturnType<typeof drizzle>;

export interface DatabaseConfig {
  url: string;
  ssl?: boolean;
  poolSize?: number;
  dialect: "mysql" | "postgresql";
}

/**
 * Get database configuration from environment
 */
export function getDatabaseConfig(): DatabaseConfig {
  return {
    url: ENV.databaseUrl,
    ssl: ENV.isProduction,
    poolSize: ENV.isProduction ? 10 : 5,
    dialect: "mysql", // Change to "postgresql" when migrating
  };
}

/**
 * Create database connection
 * Single point of connection creation - all modules use this
 */
let _db: DatabaseInstance | null = null;

export function getDb(): DatabaseInstance | null {
  if (!_db && ENV.databaseUrl) {
    try {
      _db = drizzle(ENV.databaseUrl);
    } catch (error) {
      console.warn("[Database] Failed to connect:", error);
      _db = null;
    }
  }
  return _db;
}

/**
 * Reset database connection (useful for testing or reconnection)
 */
export function resetDbConnection(): void {
  _db = null;
}

/**
 * Check database health
 */
export async function checkDbHealth(): Promise<{ connected: boolean; latencyMs: number }> {
  const start = Date.now();
  try {
    const db = getDb();
    if (!db) return { connected: false, latencyMs: 0 };
    const { sql } = await import("drizzle-orm");
    await db.execute(sql`SELECT 1`);
    return { connected: true, latencyMs: Date.now() - start };
  } catch {
    return { connected: false, latencyMs: Date.now() - start };
  }
}
