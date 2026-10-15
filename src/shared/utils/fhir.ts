/** @format */

export interface ContactPoint {
 system: "phone" | "email";
 value: string;
 use: string;
}

/** FHIR identifier systems OpenEMR recognizes for practitioners. */
export const IDENTIFIER_SYSTEM = {
 /** CMS National Provider Identifier. */
 npi: "http://hl7.org/fhir/sid/us-npi",
 /** State medical/osteopathic license number. */
 stateLicense: "urn:oid:2.16.840.1.113883.4.3.1",
} as const;

export interface HumanNameOptions {
 prefix?: string;
 suffix?: string;
}

/** FHIR `HumanName` for a person's official name. */
export function buildHumanName(
 fname: string,
 mname: string | undefined,
 lname: string,
 options: HumanNameOptions = {},
): Array<{
 use: string;
 family: string;
 given: string[];
 prefix?: string[];
 suffix?: string[];
}> {
 return [
  {
   use: "official",
   family: lname,
   given: [fname, mname].filter((n): n is string => Boolean(n)),
   ...(options.prefix ? { prefix: [options.prefix] } : {}),
   ...(options.suffix ? { suffix: [options.suffix] } : {}),
  },
 ];
}

/** FHIR `ContactPoint[]` for a person's phone/email. */
export function buildContactPoints(
 email: string | undefined,
 phone: string | undefined,
 use: string,
): ContactPoint[] {
 const points: ContactPoint[] = [];
 if (phone) points.push({ system: "phone", value: phone, use });
 if (email) points.push({ system: "email", value: email, use });
 return points;
}

export interface TelecomInput {
 email?: string;
 work?: string;
 home?: string;
 mobile?: string;
 fax?: string;
}

export interface TelecomPoint {
 system: "phone" | "email" | "fax";
 value: string;
 use?: string;
}

/**
 * Builds a practitioner's `ContactPoint[]`, distinguishing the phone uses
 * OpenEMR stores in separate columns (`work`→phonew1, `home`→phone,
 * `mobile`→phonecell).
 */
export function buildTelecom(input: TelecomInput): TelecomPoint[] {
 const points: TelecomPoint[] = [];
 if (input.work) points.push({ system: "phone", value: input.work, use: "work" });
 if (input.home) points.push({ system: "phone", value: input.home, use: "home" });
 if (input.mobile) points.push({ system: "phone", value: input.mobile, use: "mobile" });
 if (input.fax) points.push({ system: "fax", value: input.fax, use: "work" });
 if (input.email) points.push({ system: "email", value: input.email, use: "work" });
 return points;
}
