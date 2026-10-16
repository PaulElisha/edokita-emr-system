/** @format */

import { users } from "./schema/user.ts";
import { roles } from "./schema/role.ts";
import { openemrAuthStates, openemrTokens } from "./schema/openemr.ts";
import {
 appointmentOverrides,
 appointmentWaitlist,
 providerSchedules,
} from "./schema/appointment.ts";
import { passwordResetTokens, refreshTokens } from "./schema/auth.ts";
import {
 conversationMessages,
 conversationThreads,
 notifications,
 threadReads,
} from "./schema/messaging.ts";

export default {
 users,
 roles,
 openemrAuthStates,
 openemrTokens,
 appointmentOverrides,
 providerSchedules,
 appointmentWaitlist,
 refreshTokens,
 passwordResetTokens,
 conversationThreads,
 conversationMessages,
 threadReads,
 notifications,
};
