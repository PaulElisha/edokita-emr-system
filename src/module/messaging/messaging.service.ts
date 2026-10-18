import { z } from "zod";
import { db } from "@db/db.ts";
import {
 conversationMessages,
 conversationThreads,
 threadReads,
} from "@db/schema/messaging.ts";
import { roleSchema } from "@db/schema/role.ts";
import {
 findUserById,
 findUserByPatientId,
 findUserByPractitionerId,
} from "@module/user/helper.ts";
import { notifyMany } from "@module/notification/notification.service.ts";
import APIError from "@error/APIError.ts";
import { countParam } from "@shared/schemas/common.ts";
import type { ListResult, Result } from "@shared/types.ts";
import { toError } from "@shared/error/error.ts";
import { unique } from "@shared/utils/array.ts";
import { asc, desc, eq, or } from "drizzle-orm";

export interface MessageActor {
 userId: string;
 role: z.infer<typeof roleSchema>;
}

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

export const threadListQuerySchema = z.object({ _count: countParam.default(100) });
export type ThreadListQuery = z.infer<typeof threadListQuerySchema>;

export type ThreadRow = typeof conversationThreads.$inferSelect;
export type MessageRow = typeof conversationMessages.$inferSelect;

interface ActorLinks {
 userId: string;
 role: MessageActor["role"];
 patientId?: string;
 practitionerId?: string;
}

async function resolveActor(userId: string): Promise<Result<ActorLinks>> {
 const [user, err] = await findUserById(userId);
 if (err || !user) return [null, err];
 return [
  {
   userId: user.id,
   role: user.role,
   patientId: user.openemr.patientId,
   practitionerId: user.openemr.practitionerId,
  },
  null,
 ];
}

function canAccess(thread: ThreadRow, actor: ActorLinks): boolean {
 if (actor.role === "admin") return true;
 if (thread.createdBy === actor.userId) return true;
 if (actor.patientId && thread.patientId === actor.patientId) return true;
 if (actor.practitionerId && thread.practitionerId === actor.practitionerId)
  return true;
 return false;
}

class MessagingService {
 listThreads = async (
  query: ThreadListQuery,
  userId: string,
 ): Promise<Result<ListResult<ThreadRow>>> => {
  try {
   const [actor, aerr] = await resolveActor(userId);
   if (aerr || !actor) return [null, aerr];

   if (actor.role === "admin") {
    const rows = await db
     .select()
     .from(conversationThreads)
     .orderBy(desc(conversationThreads.lastMessageAt))
     .limit(query._count);
    return [{ total: rows.length, items: rows }, null];
   }

   const filters = [];
   if (actor.patientId) filters.push(eq(conversationThreads.patientId, actor.patientId));
   if (actor.practitionerId)
    filters.push(eq(conversationThreads.practitionerId, actor.practitionerId));
   filters.push(eq(conversationThreads.createdBy, actor.userId));

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
  userId: string,
 ): Promise<Result<ThreadRow>> => {
  try {
   const [actor, aerr] = await resolveActor(userId);
   if (aerr || !actor) return [null, aerr];

   const patientId =
    actor.role === "patient" ? actor.patientId : input.patientId;
   const practitionerId =
    actor.role === "doctor" ? actor.practitionerId : input.practitionerId;
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
     createdBy: userId,
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
  userId: string,
  _query: ThreadListQuery,
 ): Promise<Result<ListResult<MessageRow>>> => {
  try {
   const [loaded, terr] = await this.loadThread(threadId, userId);
   if (terr || !loaded) return [null, terr];

   const rows = await db
    .select()
    .from(conversationMessages)
    .where(eq(conversationMessages.threadId, loaded.thread.id))
    .orderBy(asc(conversationMessages.createdAt));
   return [{ total: rows.length, items: rows }, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 send = async (
  threadId: string,
  input: SendMessageInput,
  userId: string,
 ): Promise<Result<MessageRow>> => {
  try {
   const [loaded, terr] = await this.loadThread(threadId, userId);
   if (terr || !loaded) return [null, terr];
   const { thread, actor } = loaded;

   const [row] = await db
    .insert(conversationMessages)
    .values({ threadId: thread.id, senderId: userId, body: input.body })
    .returning();
   if (!row) return [null, toError("Failed to send message")];

   await Promise.all([
    db
     .update(conversationThreads)
     .set({ lastMessageAt: new Date() })
     .where(eq(conversationThreads.id, thread.id)),
    this.notifyRecipients(thread, actor),
   ]);
   return [row, null];
  } catch (e) {
   return [null, toError(e)];
  }
 };

 markRead = async (
  threadId: string,
  userId: string,
 ): Promise<Result<{ success: true }>> => {
  try {
   const [loaded, terr] = await this.loadThread(threadId, userId);
   if (terr || !loaded) return [null, terr];
   await db
    .insert(threadReads)
    .values({ threadId: loaded.thread.id, userId, lastReadAt: new Date() })
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
  userId: string,
 ): Promise<Result<{ thread: ThreadRow; actor: ActorLinks }>> => {
  const [[thread], [actor, err]] = await Promise.all([
   db
    .select()
    .from(conversationThreads)
    .where(eq(conversationThreads.id, threadId))
    .limit(1),
   resolveActor(userId),
  ]);
  if (!thread) return [null, APIError.notFound("Conversation not found")];
  if (err || !actor) return [null, err];
  if (!canAccess(thread, actor)) {
   return [null, APIError.notFound("Conversation not found")];
  }
  return [{ thread, actor }, null];
 };

 private notifyRecipients = async (
  thread: ThreadRow,
  actor: ActorLinks,
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
  ]).filter((id) => id !== actor.userId);
  await notifyMany(recipients, {
   type: "message",
   title: "New message",
   body: thread.subject ?? "You have a new message",
   data: { threadId: thread.id },
  });
 };
}

export default new MessagingService();
