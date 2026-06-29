// =============================================================================
// Database Barrel Re-Export
// =============================================================================
// This file re-exports all database helpers from modular files under ./db/
// All routers import `* as db from "../db"` — this barrel ensures backward
// compatibility while keeping the codebase organized by domain.
// =============================================================================

export * from "./db/connection";
export * from "./db/userDb";
export * from "./db/supplierDb";
export * from "./db/productDb";
export * from "./db/ncmDb";
export * from "./db/icmsDb";
export * from "./db/exchangeDb";
export * from "./db/calculationsDb";
export * from "./db/settingsDb";
export * from "./db/quotationsDb";
export * from "./db/chatDb";
export * from "./db/conversaDb";
export * from "./db/industriesDb";
export * from "./db/messagingDb";
export * from "./db/proformaDb";
export * from "./db/parametrosDb";
