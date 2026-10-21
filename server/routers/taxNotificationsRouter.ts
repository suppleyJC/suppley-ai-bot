import { protectedProcedure, router } from "../_core/trpc";
import { z } from "zod";

import * as taxNotificationService from "../services/taxNotificationService";

export const taxNotificationsRouter = router({
list: protectedProcedure
  .input(z.object({
    unreadOnly: z.boolean().optional(),
    limit: z.number().optional(),
  }).optional())
  .query(async ({ ctx, input }) => {
    return taxNotificationService.listUserNotifications(ctx.user.id, input);
  }),

getSummary: protectedProcedure.query(async ({ ctx }) => {
  return taxNotificationService.getNotificationSummary(ctx.user.id);
}),

markAsRead: protectedProcedure
  .input(z.object({ notificationId: z.number() }))
  .mutation(async ({ ctx, input }) => {
    return taxNotificationService.markNotificationAsRead(input.notificationId, ctx.user.id);
  }),

markAllAsRead: protectedProcedure.mutation(async ({ ctx }) => {
  return taxNotificationService.markAllNotificationsAsRead(ctx.user.id);
}),
});
