import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import type { User } from "../../drizzle/schema";
import { sdk } from "./sdk";
import { jwtVerify } from "jose";
import { getUserById } from "../services/authService";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "suppley-calc-secret-key-2024");
const SESSION_COOKIE = "suppley_session";

async function verifySessionToken(token: string): Promise<{ userId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { userId: payload.userId as number };
  } catch {
    return null;
  }
}

export type TrpcContext = {
  req: CreateExpressContextOptions["req"];
  res: CreateExpressContextOptions["res"];
  user: User | null;
};

export async function createContext(
  opts: CreateExpressContextOptions
): Promise<TrpcContext> {
  let user: User | null = null;

  // First try OAuth authentication (Manus)
  try {
    user = await sdk.authenticateRequest(opts.req);
  } catch (error) {
    // OAuth failed, try our custom authentication
    user = null;
  }

  // If OAuth failed, try custom JWT authentication
  if (!user) {
    // Check Authorization header (localStorage fallback for Safari iOS)
    const authHeader = opts.req.headers.authorization;
    if (authHeader?.startsWith("Bearer ")) {
      const token = authHeader.slice(7);
      const session = await verifySessionToken(token);
      if (session) {
        user = await getUserById(session.userId);
      }
    }
  }

  // If still no user, check session cookie
  if (!user) {
    const sessionCookie = opts.req.cookies?.[SESSION_COOKIE];
    if (sessionCookie) {
      const session = await verifySessionToken(sessionCookie);
      if (session) {
        user = await getUserById(session.userId);
      }
    }
  }

  return {
    req: opts.req,
    res: opts.res,
    user,
  };
}
