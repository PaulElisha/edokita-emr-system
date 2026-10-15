/** @format */
/** OpenAPI 3.0 spec describing our own hospital-management API. */
import { Env } from "@/env.ts";
import { z, type ZodObject, type ZodType } from "zod";
import { registerSchema } from "@module/auth/auth.service.ts";
import {
 doctorBodySchema,
 doctorListQuerySchema,
} from "@module/doctor/doctor.service.ts";
import {
 patientBodySchema,
 patientListQuerySchema,
} from "@module/patient/patient.service.ts";
import {
 appointmentBodySchema,
 appointmentListQuerySchema,
 slotsQuerySchema,
} from "@module/appointment/appointment.service.ts";
import {
 emrClinicalParamSchema,
 emrEncounterParamSchema,
 emrPatientParamSchema,
 encounterBodySchema,
 vitalsBodySchema,
} from "@module/emr/emr.service.ts";
import { updateUserSchema } from "@module/user/helper.ts";
import { idParamSchema } from "@shared/schemas/params.ts";

type JsonSchema = Record<string, unknown>;

const toJson = (schema: ZodType): JsonSchema =>
 z.toJSONSchema(schema, { target: "openapi-3.0" }) as JsonSchema;

const requestBody = (schema: ZodType) => ({
 content: { "application/json": { schema: toJson(schema) } },
});

const schemaRef = (name: string): JsonSchema => ({
 $ref: `#/components/schemas/${name}`,
});

const envelope = (data: JsonSchema): JsonSchema => ({
 type: "object",
 properties: { success: { type: "boolean" }, data },
});

const jsonResponse = (description: string, schemaName: string) => ({
 description,
 content: { "application/json": { schema: envelope(schemaRef(schemaName)) } },
});

interface Parameter {
 name: string;
 in: "path" | "query";
 required: boolean;
 schema: JsonSchema;
}

const paramsFrom = (
 schema: ZodObject,
 location: Parameter["in"],
 forceRequired = false,
): Parameter[] => {
 const json = toJson(schema);
 const properties = (json.properties ?? {}) as Record<string, JsonSchema>;
 const required = new Set((json.required as string[] | undefined) ?? []);
 return Object.entries(properties).map(([name, prop]) => ({
  name,
  in: location,
  required: forceRequired || required.has(name),
  schema: prop,
 }));
};

const spec = {
 openapi: "3.0.0",
 info: {
  title: "E-Dokita EMR API",
  version: Env.VERSION,
  description:
   "A hospital management gateway built on top of the OpenEMR API (standard + FHIR R4). It exposes doctors, patients, appointments, admin metrics and patient EMR records.",
 },
 servers: [{ url: Env.LOCAL_URL, description: "Local" }],
 components: {
  securitySchemes: {
   bearerAuth: { type: "http", scheme: "bearer", bearerFormat: "JWT" },
  },
  schemas: {
   User: {
    type: "object",
    properties: {
     id: { type: "string" },
     email: { type: "string", format: "email" },
     role: { type: "string" },
     firstName: { type: "string" },
     lastName: { type: "string" },
     clinicId: { type: "string" },
     openemr: {
      type: "object",
      properties: {
       subject: { type: "string" },
       fhirUser: { type: "string" },
       patientId: { type: "string" },
       practitionerId: { type: "string" },
      },
     },
     createdAt: { type: "string", format: "date-time" },
    },
   },
   PractitionerQualification: {
    type: "object",
    description:
     "Provider credential; OpenEMR exposes the specialty via users.specialty (Standard user API), not FHIR",
    properties: {
     npi: { type: "string" },
     specialty: { type: "string" },
    },
   },
   PractitionerAddress: {
    type: "object",
    properties: {
     line: { type: "string" },
     city: { type: "string" },
     state: { type: "string" },
     postalCode: { type: "string" },
     country: { type: "string" },
    },
   },
   Practitioner: {
    type: "object",
    properties: {
     id: { type: "string" },
     resourceType: { type: "string", example: "Practitioner" },
     given: { type: "string" },
     family: { type: "string" },
     fullName: { type: "string" },
     active: { type: "boolean" },
     title: { type: "string" },
     suffix: { type: "string" },
     email: { type: "string" },
     phone: { type: "string" },
     mobile: { type: "string" },
     homePhone: { type: "string" },
     fax: { type: "string" },
     address: schemaRef("PractitionerAddress"),
     qualifications: {
      type: "array",
      items: schemaRef("PractitionerQualification"),
     },
     npi: { type: "string" },
     specialty: { type: "string" },
     physicianType: { type: "string" },
     stateLicenseNumber: { type: "string" },
    },
   },
   PractitionerList: {
    type: "object",
    properties: {
     total: { type: "integer" },
     items: { type: "array", items: schemaRef("Practitioner") },
    },
   },
  },
 },
 paths: {
  "/api/auth/register": {
   post: {
    tags: ["Auth"],
    summary:
     "Sign up a patient, doctor or admin and provision the OpenEMR principal",
    requestBody: requestBody(registerSchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/auth/login": {
   post: {
    tags: ["Auth"],
    summary: "Log in with email and password; returns an app session JWT",
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/users/profile": {
   get: {
    tags: ["Users"],
    summary: "Current app user and OpenEMR connection status",
    security: [{ bearerAuth: [] }],
    responses: { "200": jsonResponse("OK", "User") },
   },
  },
  "/api/users/update": {
   put: {
    tags: ["Users"],
    summary: "Update the current app user's profile",
    security: [{ bearerAuth: [] }],
    requestBody: requestBody(updateUserSchema),
    responses: { "200": jsonResponse("OK", "User") },
   },
  },
  "/api/openemr/authorize": {
   get: {
    tags: ["Auth"],
    summary: "Build the OpenEMR authorization-code URL (PKCE + state)",
    security: [{ bearerAuth: [] }],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/openemr/callback": {
   get: {
    tags: ["Auth"],
    summary: "OAuth2 redirect target; exchanges the code for tokens",
    responses: { "302": { description: "Redirect to frontend" } },
   },
  },
  "/api/openemr/refresh": {
   post: {
    tags: ["Auth"],
    summary: "Refresh the current user's OpenEMR access token",
    security: [{ bearerAuth: [] }],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/openemr/ping": {
   get: {
    tags: ["Auth"],
    summary: "Ping OpenEMR through the user's token (version)",
    security: [{ bearerAuth: [] }],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/system/version": {
   get: {
    tags: ["System"],
    summary: "OpenEMR engine and version",
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/system/capability": {
   get: {
    tags: ["System"],
    summary: "Capability statement (supported FHIR resource types)",
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/admin/stats": {
   get: {
    tags: ["Admin"],
    summary: "Dashboard metrics (patients, doctors, appointments, records)",
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/admin/users": {
   get: {
    tags: ["Admin"],
    summary: "List OpenEMR users",
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/admin/facilities": {
   get: {
    tags: ["Admin"],
    summary: "List facilities",
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/doctors": {
   get: {
    tags: ["Doctors"],
    summary:
     "List practitioners (search by family/given/name; includes specialty/qualifications)",
    parameters: paramsFrom(doctorListQuerySchema, "query"),
    responses: { "200": jsonResponse("OK", "PractitionerList") },
   },
   post: {
    tags: ["Doctors"],
    summary: "Create a practitioner",
    requestBody: requestBody(doctorBodySchema),
    responses: { "201": jsonResponse("Created", "Practitioner") },
   },
  },
  "/api/doctors/{id}": {
   get: {
    tags: ["Doctors"],
    summary: "Get a practitioner by id (includes specialty/qualifications)",
    parameters: paramsFrom(idParamSchema, "path", true),
    responses: { "200": jsonResponse("OK", "Practitioner") },
   },
   put: {
    tags: ["Doctors"],
    summary: "Update a practitioner",
    parameters: paramsFrom(idParamSchema, "path", true),
    requestBody: requestBody(doctorBodySchema),
    responses: { "200": jsonResponse("OK", "Practitioner") },
   },
  },
  "/api/patients": {
   get: {
    tags: ["Patients"],
    summary: "List patients (search by given/family/gender/birthDate)",
    parameters: paramsFrom(patientListQuerySchema, "query"),
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["Patients"],
    summary: "Create a patient",
    requestBody: requestBody(patientBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/patients/{id}": {
   get: {
    tags: ["Patients"],
    summary: "Get a patient by id",
    parameters: paramsFrom(idParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/appointments": {
   get: {
    tags: ["Appointments"],
    summary: "List appointments (filter by patient/practitioner/date/status)",
    parameters: paramsFrom(appointmentListQuerySchema, "query"),
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["Appointments"],
    summary:
     "Book an appointment (patients book for themselves; staff may set patientId)",
    requestBody: requestBody(appointmentBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/appointments/categories": {
   get: {
    tags: ["Appointments"],
    summary: "List appointment categories (visit types)",
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/appointments/slots": {
   get: {
    tags: ["Appointments"],
    summary: "List bookable slots for a provider on a day",
    parameters: paramsFrom(slotsQuerySchema, "query"),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/appointments/{id}": {
   get: {
    tags: ["Appointments"],
    summary: "Get an appointment by id",
    parameters: paramsFrom(idParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/summary": {
   get: {
    tags: ["EMR"],
    summary: "Full clinical summary for a patient",
    parameters: paramsFrom(emrPatientParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/clinical/{kind}": {
   get: {
    tags: ["EMR"],
    summary: "Clinical records of one kind for a patient",
    parameters: paramsFrom(emrClinicalParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/vitals": {
   get: {
    tags: ["EMR"],
    summary: "Vital signs",
    parameters: paramsFrom(emrPatientParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/labs": {
   get: {
    tags: ["EMR"],
    summary: "Laboratory observations",
    parameters: paramsFrom(emrPatientParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/encounters": {
   get: {
    tags: ["EMR"],
    summary: "List encounters for a patient",
    parameters: paramsFrom(emrPatientParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["EMR"],
    summary: "Create an encounter (visit)",
    parameters: paramsFrom(emrPatientParamSchema, "path", true),
    requestBody: requestBody(encounterBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/emr/{patientId}/encounters/{encounterId}": {
   get: {
    tags: ["EMR"],
    summary: "Get an encounter by id",
    parameters: paramsFrom(emrEncounterParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/encounters/{encounterId}/vitals": {
   post: {
    tags: ["EMR"],
    summary: "Record vitals on an encounter (metric input; stored as imperial)",
    parameters: paramsFrom(emrEncounterParamSchema, "path", true),
    requestBody: requestBody(vitalsBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
 },
};

export const options: Record<string, unknown> = {
 explorer: true,
 customSiteTitle: "E-Dokita EMR API Docs",
};

export default spec;
