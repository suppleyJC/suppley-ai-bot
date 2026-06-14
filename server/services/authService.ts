import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/mysql2";
import { users, User } from "../../drizzle/schema";
import { nanoid } from "nanoid";

const SALT_ROUNDS = 12;
const ADMIN_EMAIL = "jean@suppley.com.br";

let _db: ReturnType<typeof drizzle> | null = null;

async function getDb() {
  if (!_db && process.env.DATABASE_URL) {
    _db = drizzle(process.env.DATABASE_URL);
  }
  return _db;
}

export interface RegisterInput {
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  error?: string;
}

/**
 * Register a new user with email/password
 */
export async function registerUser(input: RegisterInput): Promise<AuthResult> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Banco de dados indisponível" };
  }

  try {
    // Check if email already exists
    const existing = await db.select().from(users).where(eq(users.email, input.email.toLowerCase())).limit(1);
    if (existing.length > 0) {
      return { success: false, error: "Este email já está cadastrado" };
    }

    // Validate password strength
    if (input.password.length < 8) {
      return { success: false, error: "A senha deve ter pelo menos 8 caracteres" };
    }

    // Hash password
    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    // Determine role - admin for owner email
    const isAdmin = input.email.toLowerCase() === ADMIN_EMAIL.toLowerCase();

    // Create user
    const result = await db.insert(users).values({
      name: input.name,
      email: input.email.toLowerCase(),
      passwordHash,
      loginMethod: "email",
      role: isAdmin ? "admin" : "user",
      isEmailVerified: false,
      lastSignedIn: new Date(),
    });

    // Fetch created user
    const newUser = await db.select().from(users).where(eq(users.id, Number(result[0].insertId))).limit(1);
    
    if (newUser.length === 0) {
      return { success: false, error: "Erro ao criar usuário" };
    }

    return { success: true, user: newUser[0] };
  } catch (error) {
    console.error("[AuthService] Register error:", error);
    return { success: false, error: "Erro ao registrar usuário" };
  }
}

/**
 * Login with email/password
 */
export async function loginUser(input: LoginInput): Promise<AuthResult> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Banco de dados indisponível" };
  }

  try {
    // Find user by email
    const result = await db.select().from(users).where(eq(users.email, input.email.toLowerCase())).limit(1);
    
    if (result.length === 0) {
      return { success: false, error: "Email ou senha incorretos" };
    }

    const user = result[0];

    // Check if user has password (might be OAuth-only user)
    if (!user.passwordHash) {
      return { success: false, error: "Esta conta usa login social. Por favor, use o método de login original." };
    }

    // Verify password
    const isValid = await bcrypt.compare(input.password, user.passwordHash);
    if (!isValid) {
      return { success: false, error: "Email ou senha incorretos" };
    }

    // Update last signed in
    await db.update(users).set({ lastSignedIn: new Date() }).where(eq(users.id, user.id));

    return { success: true, user };
  } catch (error) {
    console.error("[AuthService] Login error:", error);
    return { success: false, error: "Erro ao fazer login" };
  }
}

/**
 * Get user by ID
 */
export async function getUserById(id: number): Promise<User | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(users).where(eq(users.id, id)).limit(1);
  return result[0] || null;
}

/**
 * Get user by email
 */
export async function getUserByEmail(email: string): Promise<User | null> {
  const db = await getDb();
  if (!db) return null;

  const result = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
  return result[0] || null;
}

/**
 * Generate password reset token
 */
export async function generateResetToken(email: string): Promise<{ success: boolean; token?: string; error?: string }> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Banco de dados indisponível" };
  }

  try {
    const result = await db.select().from(users).where(eq(users.email, email.toLowerCase())).limit(1);
    
    if (result.length === 0) {
      // Don't reveal if email exists or not
      return { success: true };
    }

    const user = result[0];
    const token = nanoid(32);
    const expires = new Date(Date.now() + 3600000); // 1 hour

    await db.update(users).set({
      resetPasswordToken: token,
      resetPasswordExpires: expires,
    }).where(eq(users.id, user.id));

    return { success: true, token };
  } catch (error) {
    console.error("[AuthService] Reset token error:", error);
    return { success: false, error: "Erro ao gerar token de recuperação" };
  }
}

/**
 * Reset password with token
 */
export async function resetPassword(token: string, newPassword: string): Promise<AuthResult> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Banco de dados indisponível" };
  }

  try {
    if (newPassword.length < 8) {
      return { success: false, error: "A senha deve ter pelo menos 8 caracteres" };
    }

    const result = await db.select().from(users).where(eq(users.resetPasswordToken, token)).limit(1);
    
    if (result.length === 0) {
      return { success: false, error: "Token inválido ou expirado" };
    }

    const user = result[0];

    // Check if token expired
    if (user.resetPasswordExpires && new Date() > user.resetPasswordExpires) {
      return { success: false, error: "Token expirado. Solicite uma nova recuperação de senha." };
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    // Update password and clear token
    await db.update(users).set({
      passwordHash,
      resetPasswordToken: null,
      resetPasswordExpires: null,
    }).where(eq(users.id, user.id));

    return { success: true, user };
  } catch (error) {
    console.error("[AuthService] Reset password error:", error);
    return { success: false, error: "Erro ao redefinir senha" };
  }
}

/**
 * Change password (for authenticated users)
 */
export async function changePassword(userId: number, currentPassword: string, newPassword: string): Promise<AuthResult> {
  const db = await getDb();
  if (!db) {
    return { success: false, error: "Banco de dados indisponível" };
  }

  try {
    const result = await db.select().from(users).where(eq(users.id, userId)).limit(1);
    
    if (result.length === 0) {
      return { success: false, error: "Usuário não encontrado" };
    }

    const user = result[0];

    // Verify current password
    if (user.passwordHash) {
      const isValid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!isValid) {
        return { success: false, error: "Senha atual incorreta" };
      }
    }

    if (newPassword.length < 8) {
      return { success: false, error: "A nova senha deve ter pelo menos 8 caracteres" };
    }

    // Hash new password
    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));

    return { success: true, user };
  } catch (error) {
    console.error("[AuthService] Change password error:", error);
    return { success: false, error: "Erro ao alterar senha" };
  }
}
