/**
 * Database Connection - Re-exports from config for backward compatibility
 * 
 * All database connection logic is now centralized in ./config.ts
 * This file exists to maintain existing import paths.
 */
export { getDb, getDatabaseConfig, resetDbConnection, checkDbHealth } from "./config";
export type { DatabaseInstance, DatabaseConfig } from "./config";
