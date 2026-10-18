import { z } from "zod";

export const countParam = z.coerce.number().int().min(1).max(200).optional();

export const nameSchema = z.object({
 fname: z.string().min(1),
 mname: z.string().optional(),
 lname: z.string().min(1),
});

export const genderSchema = z.enum([
 "male",
 "female",
 "other",
 "unknown",
 "M",
 "F",
 "m",
 "f",
 "1",
 "2",
]);

export const contactSchema = z.object({
 email: z.string().email().optional().or(z.literal("")),
 phone: z.string().optional(),
});

export const fhirListQuerySchema = z.object({
 search: z.string().optional(),
 given: z.string().optional(),
 family: z.string().optional(),
 _count: countParam.default(100),
});
