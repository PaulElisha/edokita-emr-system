import { db } from "@db/db.ts";
import { notifications } from "@db/schema/messaging.ts";
import logger from "@app/logger.ts";
import APIError from "@error/APIError.ts";
import { countParam } from "@shared/schemas/common.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { unique } from "@shared/utils/array.ts";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";

export type NotificationRow = typeof notifications.$inferSelect;

export interface NotifyInput {
 type: string;
 title: string;
 body?: string;
 data?: Record<string, unknown>;
}

export const notificationQuerySchema = z.object({
 unread: z.enum(["true", "false"]).optional(),
 _count: countParam.default(50),
});
export type NotificationQuery = z.infer<typeof notificationQuerySchema>;

export async function notify(
 userId: string | null | undefined,
 input: NotifyInput,
): Promise<void> {
 if (!userId) return;
 try {
  await db.insert(notifications).values({
   userId,
   type: input.type,
   title: input.title,
   body: input.body,
   data: input.data,
  });
 } catch (e) {
  logger.warn({ err: e, userId, type: input.type }, "Failed to create notification");
 }
}

export async function notifyMany(
 userIds: Array<string | null | undefined>,
 input: NotifyInput,
): Promise<void> {
 const recipients = unique(userIds);
 if (recipients.length === 0) return;
 try {
  await db.insert(notifications).values(
   recipients.map((userId) => ({
    userId,
    type: input.type,
    title: input.title,
    body: input.body,
    data: input.data,
   })),
  );
 } catch (e) {
  logger.warn(
   { err: e, count: recipients.length, type: input.type },
   "Failed to create notifications",
  );
 }
}

class NotificationService {
 list = async (
 userId: string,
 query: NotificationQuery,
 ): Promise<Result<ListResult<NotificationRow>>> => {
  try {
   const where =
    query.unread === "true"
     ? and(eq(notifications.userId, userId), isNull(notifications.readAt))
     : eq(notifications.userId, userId);
   const rows = await db
    .select()
    .from(notifications)
    .where(where)
    .orderBy(desc(notifications.createdAt))
    .limit(query._count);
   return [{ total: rows.length, items: rows }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 markRead = async (
 userId: string,
 id: string,
 ): Promise<Result<{ success: true }>> => {
  try {
   const [row] = await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.id, id), eq(notifications.userId, userId)))
    .returning({ id: notifications.id });
   if (!row) return [null, APIError.notFound("Notification not found")];
   return [{ success: true }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 markAllRead = async (userId: string): Promise<Result<{ success: true }>> => {
  try {
   await db
    .update(notifications)
    .set({ readAt: new Date() })
    .where(and(eq(notifications.userId, userId), isNull(notifications.readAt)));
   return [{ success: true }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };
}

export default new NotificationService();
