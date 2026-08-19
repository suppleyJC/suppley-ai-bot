import { publicProcedure, protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { COOKIE_NAME } from "@shared/const";
import { getSessionCookieOptions } from "../_core/cookies";
import { registerUser, loginUser, getUserById, generateResetToken, resetPassword, changePassword, countUsers } from "../services/authService";
import { SignJWT, jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(process.env.JWT_SECRET || "excambia-calc-secret-key-2024");
const SESSION_COOKIE = "suppley_session";
const SESSION_EXPIRY = 30 * 24 * 60 * 60 * 1000; // 30 days

async function createSessionToken(userId: number): Promise<string> {
  return new SignJWT({ userId })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("30d")
    .setIssuedAt()
    .sign(JWT_SECRET);
}

async function verifySessionToken(token: string): Promise<{ userId: number } | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return { userId: payload.userId as number };
  } catch {
    return null;
  }
}

export const authRouter = router({
me: publicProcedure.query(async ({ ctx }) => {
  // First check OAuth user
  if (ctx.user) return ctx.user;
  
  // Check Authorization header (localStorage fallback for Safari iOS)
  const authHeader = ctx.req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const session = await verifySessionToken(token);
    if (session) {
      const user = await getUserById(session.userId);
      if (user) return user;
    }
  }
  
  // Then check email session cookie
  const sessionCookie = ctx.req.cookies?.[SESSION_COOKIE];
  if (sessionCookie) {
    const session = await verifySessionToken(sessionCookie);
    if (session) {
      const user = await getUserById(session.userId);
      return user || null;
    }
  }
  return null;
}),

register: publicProcedure
  .input(z.object({
    name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
    email: z.string().email("Email inválido"),
    password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
  }))
  .mutation(async ({ input, ctx }) => {
    // Auto-cadastro público desabilitado: novos usuários são criados pelo
    // administrador em Configurações → Usuários. Exceção: bootstrap do 1º
    // usuário quando o banco ainda está vazio (vira admin automaticamente).
    const existingCount = await countUsers();
    if (existingCount > 0) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Cadastro disponível apenas pelo administrador. Solicite acesso ao administrador do sistema.",
      });
    }

    const result = await registerUser(input);
    if (!result.success || !result.user) {
      throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Erro ao registrar" });
    }
    
    // Create session
    const token = await createSessionToken(result.user.id);
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_EXPIRY });
    
    // Return token for localStorage fallback (Safari iOS)
    return { success: true, user: result.user, token };
  }),

login: publicProcedure
  .input(z.object({
    email: z.string().email("Email inválido"),
    password: z.string().min(1, "Senha é obrigatória"),
  }))
  .mutation(async ({ input, ctx }) => {
    const result = await loginUser(input);
    if (!result.success || !result.user) {
      throw new TRPCError({ code: "UNAUTHORIZED", message: result.error || "Credenciais inválidas" });
    }
    
    // Create session
    const token = await createSessionToken(result.user.id);
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.cookie(SESSION_COOKIE, token, { ...cookieOptions, maxAge: SESSION_EXPIRY });
    
    // Return token for localStorage fallback (Safari iOS)
    return { success: true, user: result.user, token };
  }),

logout: publicProcedure.mutation(({ ctx }) => {
  const cookieOptions = getSessionCookieOptions(ctx.req);
  ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
  ctx.res.clearCookie(SESSION_COOKIE, { ...cookieOptions, maxAge: -1 });
  return { success: true } as const;
}),

requestPasswordReset: publicProcedure
  .input(z.object({ email: z.string().email() }))
  .mutation(async ({ input }) => {
    await generateResetToken(input.email);
    return { success: true, message: "Se o email existir, você receberá instruções de recuperação." };
  }),

resetPassword: publicProcedure
  .input(z.object({
    token: z.string(),
    password: z.string().min(8),
  }))
  .mutation(async ({ input }) => {
    const result = await resetPassword(input.token, input.password);
    if (!result.success) {
      throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Erro ao redefinir senha" });
    }
    return { success: true };
  }),

changePassword: protectedProcedure
  .input(z.object({
    currentPassword: z.string(),
    newPassword: z.string().min(8),
  }))
  .mutation(async ({ input, ctx }) => {
    const result = await changePassword(ctx.user.id, input.currentPassword, input.newPassword);
    if (!result.success) {
      throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Erro ao alterar senha" });
    }
    return { success: true };
  }),
});
