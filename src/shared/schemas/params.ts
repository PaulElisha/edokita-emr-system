import { z } from "zod";

export const idParamSchema = z.object({
 id: z.string().min(1),
});
export type IdParam = z.infer<typeof idParamSchema>;
