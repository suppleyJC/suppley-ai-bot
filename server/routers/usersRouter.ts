/**
 * usersRouter — gestão de usuários (apenas administradores).
 *
 * Somente o administrador cadastra, altera papéis e remove usuários. O
 * administrador principal (dono) é protegido: não pode ser rebaixado nem removido.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { adminProcedure, router } from "../_core/trpc";
import { listUsers, adminCreateUser, updateUserRole, deleteUser } from "../services/authService";

export const usersRouter = router({
  list: adminProcedure.query(() => listUsers()),

  create: adminProcedure
    .input(
      z.object({
        name: z.string().min(2, "Nome deve ter pelo menos 2 caracteres"),
        email: z.string().email("Email inválido"),
        password: z.string().min(8, "Senha deve ter pelo menos 8 caracteres"),
        role: z.enum(["user", "admin"]).default("user"),
      }),
    )
    .mutation(async ({ input }) => {
      const result = await adminCreateUser(input);
      if (!result.success || !result.user) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Erro ao criar usuário" });
      }
      const { passwordHash: _omit, ...safe } = result.user as any;
      return { success: true, user: safe };
    }),

  updateRole: adminProcedure
    .input(z.object({ id: z.number().int().positive(), role: z.enum(["user", "admin"]) }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode alterar o próprio papel" });
      }
      const result = await updateUserRole(input.id, input.role);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Erro ao atualizar papel" });
      }
      return { success: true };
    }),

  remove: adminProcedure
    .input(z.object({ id: z.number().int().positive() }))
    .mutation(async ({ input, ctx }) => {
      if (input.id === ctx.user.id) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Você não pode remover a si mesmo" });
      }
      const result = await deleteUser(input.id);
      if (!result.success) {
        throw new TRPCError({ code: "BAD_REQUEST", message: result.error || "Erro ao remover usuário" });
      }
      return { success: true };
    }),
});
