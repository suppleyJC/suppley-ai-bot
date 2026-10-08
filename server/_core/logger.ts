/**
 * Logging estruturado — facilita observabilidade
 * Formato: JSON estruturado (compatible com cloud logging)
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: Record<string, unknown>;
  error?: {
    name: string;
    message: string;
    stack?: string;
  };
}

const isDev = process.env.NODE_ENV !== "production";

function formatEntry(entry: LogEntry): string {
  if (isDev) {
    // Desenvolvimento: formato legível
    const contextStr = entry.context ? ` | ${JSON.stringify(entry.context)}` : "";
    const errorStr = entry.error ? ` | Error: ${entry.error.message}` : "";
    return `[${entry.timestamp}] ${entry.level.toUpperCase()}: ${entry.message}${contextStr}${errorStr}`;
  } else {
    // Produção: JSON estruturado
    return JSON.stringify(entry);
  }
}

function getConsoleMethod(level: LogLevel) {
  switch (level) {
    case "debug":
      return console.debug;
    case "info":
      return console.info;
    case "warn":
      return console.warn;
    case "error":
      return console.error;
  }
}

export const logger = {
  debug(message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "debug",
      message,
      context,
    };
    getConsoleMethod("debug")(formatEntry(entry));
  },

  info(message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "info",
      message,
      context,
    };
    getConsoleMethod("info")(formatEntry(entry));
  },

  warn(message: string, context?: Record<string, unknown>) {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "warn",
      message,
      context,
    };
    getConsoleMethod("warn")(formatEntry(entry));
  },

  error(message: string, error?: Error | unknown, context?: Record<string, unknown>) {
    const err = error instanceof Error ? error : new Error(String(error));
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level: "error",
      message,
      context,
      error: {
        name: err.name,
        message: err.message,
        stack: isDev ? err.stack : undefined,
      },
    };
    getConsoleMethod("error")(formatEntry(entry));
  },
};
