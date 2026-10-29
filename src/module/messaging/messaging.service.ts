/** @format */

import { z } from "zod";
import { db } from "@db/db.ts";
import { Transactional } from "@db/transaction.ts";
import {
 conversationMessages,
 conversationThreads,
 threadReads,
} from "@db/schema/messaging.ts";
import {
 findUserByPatientId,
 findUserByPractitionerId,
} from "@module/user/helper.ts";
import type { PublicUser } from "@module/user/helper.ts";
import { notifyMany } from "@module/notification/notification.service.ts";
import APIError from "@error/APIError.ts";
import { countParam } from "@shared/schemas/common.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { unique } from "@shared/utils/array.ts";
import { asc, desc, eq, or } from "drizzle-orm";

export const threadBodySchema = z.object({
 patientId: z.string().optional(),
 practitionerId: z.string().optional(),
 subject: z.string().max(255).optional(),
});
export type CreateThreadInput = z.infer<typeof threadBodySchema>;

export const messageBodySchema = z.object({
 body: z.string().min(1).max(10000),
});
export type SendMessageInput = z.infer<typeof messageBodySchema>;

export const threadListQuerySchema = z.object({
 _count: countParam.default(100),
});
export type ThreadListQuery = z.infer<typeof threadListQuerySchema>;

type ThreadRow = typeof conversationThreads.$inferSelect;
type MessageRow = typeof conversationMessages.$inferSelect;

function canAccess(thread: ThreadRow, user: PublicUser): boolean {
 if (user.role === "admin") return true;
 if (thread.createdBy === user.id) return true;
 if (user.openemr.patientId && thread.patientId === user.openemr.patientId)
  return true;
 if (
  user.openemr.practitionerId &&
  thread.practitionerId === user.openemr.practitionerId
 )
  return true;
 return false;
}

class MessagingService {
 listThreads = async (
  query: ThreadListQuery,
  user: PublicUser,
 ): Promise<Result<ListResult<ThreadRow>>> => {
  try {
   if (user.role === "admin") {
    const rows = await db
     .select()
     .from(conversationThreads)
     .orderBy(desc(conversationThreads.lastMessageAt))
     .limit(query._count);
    return [{ total: rows.length, items: rows }, null];
   }

   const filters = [];
   if (user.openemr.patientId)
    filters.push(eq(conversationThreads.patientId, user.openemr.patientId));
   if (user.openemr.practitionerId)
    filters.push(
     eq(conversationThreads.practitionerId, user.openemr.practitionerId),
    );
   filters.push(eq(conversationThreads.createdBy, user.id));

   const rows = await db
    .select()
    .from(conversationThreads)
    .where(or(...filters))
    .orderBy(desc(conversationThreads.lastMessageAt))
    .limit(query._count);
   return [{ total: rows.length, items: rows }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 createThread = async (
  input: CreateThreadInput,
  user: PublicUser,
 ): Promise<Result<ThreadRow>> => {
  try {
   const patientId = user.openemr.patientId ?? input.patientId;
   const practitionerId = user.openemr.practitionerId ?? input.practitionerId;
   if (!patientId && !practitionerId) {
    return [
     null,
     APIError.badRequest("A patientId or practitionerId is required"),
    ];
   }

   const [row] = await db
    .insert(conversationThreads)
    .values({
     subject: input.subject,
     patientId,
     practitionerId,
     createdBy: user.id,
     lastMessageAt: new Date(),
    })
    .returning();
   if (!row) return [null, toError("Failed to create conversation")];
   return [row, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 listMessages = async (
  threadId: string,
  user: PublicUser,
  _query: ThreadListQuery,
 ): Promise<Result<ListResult<MessageRow>>> => {
  try {
   const [thread, terr] = await this.loadThread(threadId, user);
   if (terr || !thread) return [null, terr];

   const rows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.threadId, thread.id))
    .orderBy(asc(conversationMessages.createdAt));
   return [{ total: rows.length, items: rows }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 send = async (
  threadId: string,
  input: SendMessageInput,
  user: PublicUser,
 ): Promise<Result<MessageRow>> => {
  try {
   const [thread, terr] = await this.loadThread(threadId, user);
   if (terr || !thread) return [null, terr];

   const row = await this.persistMessage(thread.id, user.id, input.body);
   await this.notifyRecipients(thread, user);
   return [row, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 @Transactional()
 private async persistMessage(
  threadId: string,
  senderId: string,
  body: string,
 ): Promise<MessageRow> {
  const [created] = await db
   .insert(conversationMessages)
   .values({ threadId, senderId, body })
   .returning();
  if (!created) throw toError("Failed to send message");
  await db
   .update(conversationThreads)
   .set({ lastMessageAt: new Date() })
   .where(eq(conversationThreads.id, threadId));
  return created;
 }

 markRead = async (
  threadId: string,
  user: PublicUser,
 ): Promise<Result<{ success: true }>> => {
  try {
   const [thread, terr] = await this.loadThread(threadId, user);
   if (terr || !thread) return [null, terr];
   await db
    .insert(threadReads)
    .values({
     threadId: thread.id,
     userId: user.id,
     lastReadAt: new Date(),
    })
    .onConflictDoUpdate({
     target: [threadReads.threadId, threadReads.userId],
     set: { lastReadAt: new Date() },
    });
   return [{ success: true }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 private loadThread = async (
  threadId: string,
  user: PublicUser,
 ): Promise<Result<ThreadRow>> => {
  const [thread] = await db
   .select()
   .from(conversationThreads)
   .where(eq(conversationThreads.id, threadId))
   .limit(1);
  if (!thread) return [null, APIError.notFound("Conversation not found")];
  if (!canAccess(thread, user)) {
   return [null, APIError.notFound("Conversation not found")];
  }
  return [thread, null];
 };

 private notifyRecipients = async (
  thread: ThreadRow,
  user: PublicUser,
 ): Promise<void> => {
  const [patient, practitioner] = await Promise.all([
   thread.patientId ? findUserByPatientId(thread.patientId) : null,
   thread.practitionerId
    ? findUserByPractitionerId(thread.practitionerId)
    : null,
  ]);
  const recipients = unique([
   thread.createdBy,
   patient?.[0]?.id,
   practitioner?.[0]?.id,
  ]).filter((id) => id !== user.id);
  await notifyMany(recipients, {
   type: "message",
   title: "New message",
   body: thread.subject ?? "You have a new message",
   data: { threadId: thread.id },
  });
 };
}

export default new MessagingService();
