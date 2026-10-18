import { Env } from "@/env.ts";
import { z, type ZodObject, type ZodType } from "zod";
import { registerSchema, loginSchema } from "@module/auth/auth.service.ts";
import {
 changePasswordSchema,
 forgotPasswordSchema,
 refreshTokenSchema,
 resetPasswordSchema,
} from "@module/auth/auth.service.ts";
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
 appointmentUpdateSchema,
 slotsQuerySchema,
} from "@module/appointment/appointment.service.ts";
import {
 allergyBodySchema,
 conditionBodySchema,
 emrClinicalItemParamSchema,
 emrClinicalParamSchema,
 emrEncounterParamSchema,
 emrObservationParamSchema,
 emrPatientParamSchema,
 emrSoapNoteParamSchema,
 emrVitalItemParamSchema,
 encounterBodySchema,
 medicationBodySchema,
 soapNoteBodySchema,
 vitalsBodySchema,
} from "@module/emr/emr.service.ts";
import {
 prescriptionBodySchema,
 prescriptionListQuerySchema,
} from "@module/prescription/prescription.service.ts";
import {
 practitionerParamSchema,
 scheduleBodySchema,
} from "@module/schedule/schedule.service.ts";
import {
 waitlistBodySchema,
 waitlistQuerySchema,
} from "@module/waitlist/waitlist.service.ts";
import {
 messageBodySchema,
 threadBodySchema,
 threadListQuerySchema,
} from "@module/messaging/messaging.service.ts";
import { notificationQuerySchema } from "@module/notification/notification.service.ts";
import {
 labOrderBodySchema,
 labOrderListQuerySchema,
 labResultBodySchema,
 labResultListQuerySchema,
 labResultParamSchema,
} from "@module/lab/lab.service.ts";
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

const jsonArrayResponse = (description: string, itemName: string) => ({
 description,
 content: {
  "application/json": {
   schema: envelope({ type: "array", items: schemaRef(itemName) }),
  },
 },
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
 security: [{ bearerAuth: [] }],
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
   UserProfile: {
    type: "object",
    properties: {
     user: { $ref: "#/components/schemas/User" },
     openemr: {
      type: "object",
      properties: {
       connected: { type: "boolean" },
       expiresAt: { type: "string", format: "date-time", nullable: true },
       scope: { type: "string", nullable: true },
      },
     },
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
   Patient: {
    type: "object",
    properties: {
     id: { type: "string" },
     resourceType: { type: "string", example: "Patient" },
     given: { type: "string" },
     family: { type: "string" },
     fullName: { type: "string" },
     gender: { type: "string" },
     birthDate: { type: "string", format: "date" },
     ageYears: { type: "integer" },
     active: { type: "boolean" },
     phone: { type: "string" },
     email: { type: "string" },
     address: schemaRef("PractitionerAddress"),
    },
   },
   PatientList: {
    type: "object",
    properties: {
     total: { type: "integer" },
     items: { type: "array", items: schemaRef("Patient") },
    },
   },
   AppointmentParticipant: {
    type: "object",
    description: "A person, location or device on an appointment",
    properties: {
     role: { type: "string", example: "PPRF" },
     type: { type: "array", items: { type: "string" } },
     actorType: { type: "string", example: "Practitioner" },
     actorId: { type: "string" },
     actorDisplay: { type: "string" },
     status: { type: "string" },
    },
   },
   Appointment: {
    type: "object",
    properties: {
     id: { type: "string" },
     resourceType: { type: "string", example: "Appointment" },
     status: { type: "string" },
     start: { type: "string", format: "date-time" },
     end: { type: "string", format: "date-time" },
     type: { type: "string" },
     typeCode: { type: "string" },
     description: { type: "string" },
     participants: {
      type: "array",
      items: schemaRef("AppointmentParticipant"),
     },
     patientId: {
      type: "string",
      description: "Id of the patient participant on the appointment",
     },
     doctorId: {
      type: "string",
      description: "Id of the practitioner (primary performer)",
     },
     locationId: { type: "string" },
    },
   },
   AppointmentList: {
    type: "object",
    properties: {
     total: { type: "integer" },
     items: { type: "array", items: schemaRef("Appointment") },
    },
   },
   AppointmentCategory: {
    type: "object",
    properties: {
     code: { type: "string" },
     name: { type: "string" },
    },
   },
   Slot: {
    type: "object",
    properties: {
     start: { type: "string", format: "date-time" },
     end: { type: "string", format: "date-time" },
     available: { type: "boolean" },
    },
   },
   ObservationValue: {
    type: "object",
    properties: {
     value: {
      oneOf: [{ type: "number" }, { type: "string" }, { type: "boolean" }],
     },
     unit: { type: "string" },
    },
   },
   ObservationReferenceRange: {
    type: "object",
    properties: {
     low: { type: "number" },
     high: { type: "number" },
     unit: { type: "string" },
     text: { type: "string" },
    },
   },
   Observation: {
    type: "object",
    properties: {
     id: { type: "string" },
     code: { type: "string" },
     category: { type: "array", items: { type: "string" } },
     effective: { type: "string", format: "date-time" },
     value: schemaRef("ObservationValue"),
     referenceRange: {
      type: "array",
      items: schemaRef("ObservationReferenceRange"),
     },
     components: {
      type: "array",
      items: {
       type: "object",
       properties: {
        code: { type: "string" },
        value: schemaRef("ObservationValue"),
       },
      },
     },
     encounterId: { type: "string" },
     provider: {
      type: "object",
      properties: { id: { type: "string" }, name: { type: "string" } },
     },
     authoredAt: { type: "string", format: "date-time" },
    },
   },
   LabResult: {
    type: "object",
    additionalProperties: true,
    properties: {
     result_uuid: { type: "string" },
     procedure_result_id: { type: "integer" },
     result_code: { type: "string" },
     result_text: { type: "string" },
     result: { type: "string" },
     units: { type: "string" },
     range: { type: "string" },
     abnormal: { type: "string" },
     result_status: { type: "string" },
     date: { type: "string" },
     comments: { type: "string" },
     procedure_report_id: { type: "integer" },
     procedure_order_id: { type: "integer" },
     date_report: { type: "string" },
     report_status: { type: "string" },
     review_status: { type: "string" },
     patient_id: { type: "integer" },
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
     security: [],
     requestBody: requestBody(registerSchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/auth/login": {
   post: {
    tags: ["Auth"],
    summary: "Log in with email and password; returns an app session JWT",
    security: [],
    requestBody: requestBody(loginSchema),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/auth/refresh": {
   post: {
    tags: ["Auth"],
    summary: "Exchange a refresh token for a new access/refresh token pair",
    security: [],
    requestBody: requestBody(refreshTokenSchema),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/auth/change-password": {
   post: {
    tags: ["Auth"],
    summary: "Change the current user's password (revoke all sessions)",
    security: [{ bearerAuth: [] }],
    requestBody: requestBody(changePasswordSchema),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/auth/forgot-password": {
   post: {
    tags: ["Auth"],
    summary:
     "Request a password reset token (returned only outside production)",
    security: [],
    requestBody: requestBody(forgotPasswordSchema),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/auth/reset-password": {
   post: {
    tags: ["Auth"],
    summary: "Set a new password using a reset token",
    security: [],
    requestBody: requestBody(resetPasswordSchema),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/auth/logout": {
   post: {
    tags: ["Auth"],
    summary: "Revoke the current user's refresh tokens (log out)",
    security: [{ bearerAuth: [] }],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/users/profile": {
   get: {
    tags: ["Users"],
    summary: "Current app user and OpenEMR connection status",
    security: [{ bearerAuth: [] }],
    responses: { "200": jsonResponse("OK", "UserProfile") },
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
    security: [],
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
    security: [],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/system/capability": {
   get: {
    tags: ["System"],
    summary: "Capability statement (supported FHIR resource types)",
    security: [],
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
  "/api/doctors/patients": {
   get: {
    tags: ["Doctors"],
    summary: "List the calling doctor's connected patients",
    responses: { "200": jsonResponse("OK", "PatientList") },
   },
  },
  "/api/patients": {
   get: {
    tags: ["Patients"],
    summary: "List patients (search by given/family/gender/birthDate)",
    parameters: paramsFrom(patientListQuerySchema, "query"),
    responses: { "200": jsonResponse("OK", "PatientList") },
   },
   post: {
    tags: ["Patients"],
    summary: "Create a patient",
    requestBody: requestBody(patientBodySchema),
    responses: { "201": jsonResponse("Created", "Patient") },
   },
  },
  "/api/patients/{id}": {
   get: {
    tags: ["Patients"],
    summary: "Get a patient by id",
    parameters: paramsFrom(idParamSchema, "path", true),
    responses: { "200": jsonResponse("OK", "Patient") },
   },
   put: {
    tags: ["Patients"],
    summary: "Update a patient",
    parameters: paramsFrom(idParamSchema, "path", true),
    requestBody: requestBody(patientBodySchema),
    responses: { "200": jsonResponse("OK", "Patient") },
   },
  },
  "/api/appointments": {
   get: {
    tags: ["Appointments"],
    summary:
     "List appointments (doctors are scoped to their own; filter by patient/practitioner/date/status)",
    parameters: paramsFrom(appointmentListQuerySchema, "query"),
    responses: { "200": jsonResponse("OK", "AppointmentList") },
   },
   post: {
    tags: ["Appointments"],
    summary:
     "Book an appointment (patients book for themselves; staff may set patientId)",
    requestBody: requestBody(appointmentBodySchema),
    responses: { "201": jsonResponse("Created", "Appointment") },
   },
  },
  "/api/appointments/categories": {
   get: {
    tags: ["Appointments"],
    summary: "List appointment categories (visit types)",
    responses: { "200": jsonArrayResponse("OK", "AppointmentCategory") },
   },
  },
  "/api/appointments/slots": {
   get: {
    tags: ["Appointments"],
    summary: "List bookable slots for a provider on a day",
    parameters: paramsFrom(slotsQuerySchema, "query"),
    responses: { "200": jsonArrayResponse("OK", "Slot") },
   },
  },
  "/api/appointments/{id}": {
   get: {
    tags: ["Appointments"],
    summary: "Get an appointment by id (local status overlay applied)",
    parameters: paramsFrom(idParamSchema, "path", true),
    responses: { "200": jsonResponse("OK", "Appointment") },
   },
   patch: {
    tags: ["Appointments"],
    summary:
     "Update appointment status, reschedule window or note (local overlay)",
    parameters: paramsFrom(idParamSchema, "path", true),
    requestBody: requestBody(appointmentUpdateSchema),
    responses: { "200": jsonResponse("OK", "Appointment") },
   },
   delete: {
    tags: ["Appointments"],
    summary: "Cancel/remove an appointment (deletes upstream in OpenEMR)",
    parameters: paramsFrom(idParamSchema, "path", true),
    responses: { "200": jsonResponse("OK", "Appointment") },
   },
  },
  "/api/emr/{patientId}/summary": {
   get: {
    tags: ["EMR"],
    summary:
     "Full clinical summary for a patient (includes who last attended and when)",
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
  "/api/emr/{patientId}/labs/{observationId}": {
   get: {
    tags: ["EMR"],
    summary: "Get a single laboratory observation for a patient",
    parameters: paramsFrom(emrObservationParamSchema, "path", true),
    responses: { "200": jsonResponse("OK", "Observation") },
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
  "/api/emr/{patientId}/encounters/{encounterId}/vitals/{vitalId}": {
   put: {
    tags: ["EMR"],
    summary: "Update a recorded vital signs entry",
    parameters: paramsFrom(emrVitalItemParamSchema, "path", true),
    requestBody: requestBody(vitalsBodySchema),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/conditions": {
   post: {
    tags: ["EMR"],
    summary: "Record a problem/condition (ICD-10 coded) for a patient",
    parameters: paramsFrom(emrPatientParamSchema, "path", true),
    requestBody: requestBody(conditionBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/emr/{patientId}/conditions/{itemId}": {
   put: {
    tags: ["EMR"],
    summary: "Update a recorded condition",
    parameters: paramsFrom(emrClinicalItemParamSchema, "path", true),
    requestBody: requestBody(conditionBodySchema),
    responses: { "200": { description: "OK" } },
   },
   delete: {
    tags: ["EMR"],
    summary: "Delete a recorded condition",
    parameters: paramsFrom(emrClinicalItemParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/allergies": {
   post: {
    tags: ["EMR"],
    summary: "Record an allergy/intolerance for a patient",
    parameters: paramsFrom(emrPatientParamSchema, "path", true),
    requestBody: requestBody(allergyBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/emr/{patientId}/allergies/{itemId}": {
   put: {
    tags: ["EMR"],
    summary: "Update a recorded allergy",
    parameters: paramsFrom(emrClinicalItemParamSchema, "path", true),
    requestBody: requestBody(allergyBodySchema),
    responses: { "200": { description: "OK" } },
   },
   delete: {
    tags: ["EMR"],
    summary: "Delete a recorded allergy",
    parameters: paramsFrom(emrClinicalItemParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/medications": {
   post: {
    tags: ["EMR"],
    summary: "Record an active medication for a patient",
    parameters: paramsFrom(emrPatientParamSchema, "path", true),
    requestBody: requestBody(medicationBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/emr/{patientId}/medications/{itemId}": {
   put: {
    tags: ["EMR"],
    summary: "Update a recorded medication",
    parameters: paramsFrom(emrClinicalItemParamSchema, "path", true),
    requestBody: requestBody(medicationBodySchema),
    responses: { "200": { description: "OK" } },
   },
   delete: {
    tags: ["EMR"],
    summary: "Delete a recorded medication",
    parameters: paramsFrom(emrClinicalItemParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/encounters/{encounterId}/soap-notes": {
   get: {
    tags: ["EMR"],
    summary:
     "List SOAP notes on an encounter (with the recording clinician, when known)",
    parameters: paramsFrom(emrEncounterParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["EMR"],
    summary: "Record a SOAP note on an encounter",
    parameters: paramsFrom(emrEncounterParamSchema, "path", true),
    requestBody: requestBody(soapNoteBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/emr/{patientId}/encounters/{encounterId}/soap-notes/{noteId}": {
   get: {
    tags: ["EMR"],
    summary: "Get a SOAP note by id (with the recording clinician, when known)",
    parameters: paramsFrom(emrSoapNoteParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
   put: {
    tags: ["EMR"],
    summary: "Update a SOAP note",
    parameters: paramsFrom(emrSoapNoteParamSchema, "path", true),
    requestBody: requestBody(soapNoteBodySchema),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/prescriptions": {
   get: {
    tags: ["Prescriptions"],
    summary:
     "List prescriptions (patients see only their own; staff need patient_uuid)",
    parameters: paramsFrom(prescriptionListQuerySchema, "query"),
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["Prescriptions"],
    summary: "Write a prescription to the patient's OpenEMR chart",
    requestBody: requestBody(prescriptionBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/prescriptions/{id}": {
   get: {
    tags: ["Prescriptions"],
    summary: "Get a prescription by id",
    parameters: paramsFrom(idParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
   delete: {
    tags: ["Prescriptions"],
    summary: "Delete a prescription",
    parameters: [
     ...paramsFrom(idParamSchema, "path", true),
     {
      name: "patientId",
      in: "query",
      required: false,
      description: "Patient whose chart to remove the prescription from",
      schema: { type: "string" },
     },
    ],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/schedules/{practitionerId}": {
   get: {
    tags: ["Schedules"],
    summary: "Working-hours schedule for a provider (OpenEMR fallback applied)",
    parameters: paramsFrom(practitionerParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
   put: {
    tags: ["Schedules"],
    summary: "Update the provider's working-hours schedule (full replacement)",
    parameters: paramsFrom(practitionerParamSchema, "path", true),
    requestBody: requestBody(scheduleBodySchema),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/waitlist": {
   get: {
    tags: ["Waitlist"],
    summary: "List waitlist entries (patients see only their own)",
    parameters: paramsFrom(waitlistQuerySchema, "query"),
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["Waitlist"],
    summary: "Request an earlier appointment (patients book for themselves)",
    requestBody: requestBody(waitlistBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/waitlist/{id}": {
   delete: {
    tags: ["Waitlist"],
    summary: "Remove a waitlist entry",
    parameters: paramsFrom(idParamSchema, "path", true),
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/conversations": {
   get: {
    tags: ["Messaging"],
    summary: "List conversation threads the caller participates in",
    parameters: paramsFrom(threadListQuerySchema, "query"),
    security: [{ bearerAuth: [] }],
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["Messaging"],
    summary: "Start a conversation",
    security: [{ bearerAuth: [] }],
    requestBody: requestBody(threadBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/conversations/{id}/messages": {
   get: {
    tags: ["Messaging"],
    summary: "List messages in a conversation",
    parameters: [
     ...paramsFrom(idParamSchema, "path", true),
     ...paramsFrom(threadListQuerySchema, "query"),
    ],
    security: [{ bearerAuth: [] }],
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["Messaging"],
    summary: "Send a message (notifies the other party)",
    parameters: paramsFrom(idParamSchema, "path", true),
    security: [{ bearerAuth: [] }],
    requestBody: requestBody(messageBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/conversations/{id}/read": {
   post: {
    tags: ["Messaging"],
    summary: "Mark a conversation as read",
    parameters: paramsFrom(idParamSchema, "path", true),
    security: [{ bearerAuth: [] }],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/notifications": {
   get: {
    tags: ["Notifications"],
    summary: "List the caller's notifications (optionally unread only)",
    parameters: paramsFrom(notificationQuerySchema, "query"),
    security: [{ bearerAuth: [] }],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/notifications/read-all": {
   post: {
    tags: ["Notifications"],
    summary: "Mark every notification as read",
    security: [{ bearerAuth: [] }],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/notifications/{id}/read": {
   post: {
    tags: ["Notifications"],
    summary: "Mark a notification as read",
    parameters: paramsFrom(idParamSchema, "path", true),
    security: [{ bearerAuth: [] }],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/lab/orders": {
   get: {
    tags: ["Lab"],
    summary:
     "List lab orders (patients see their own; staff filter by patientId/status)",
    parameters: paramsFrom(labOrderListQuerySchema, "query"),
    security: [{ bearerAuth: [] }],
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["Lab"],
    summary: "Create a lab order (doctor/admin only)",
    security: [{ bearerAuth: [] }],
    requestBody: requestBody(labOrderBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/lab/results": {
   get: {
    tags: ["Lab"],
    summary:
     "List lab results (by orderId or patientId; patients see only their own)",
    parameters: paramsFrom(labResultListQuerySchema, "query"),
    security: [{ bearerAuth: [] }],
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["Lab"],
    summary:
     "Record lab results against an order (lab/admin only; notifies the ordering doctor)",
    security: [{ bearerAuth: [] }],
    requestBody: requestBody(labResultBodySchema),
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/lab/results/{resultId}": {
   get: {
    tags: ["Lab"],
    summary: "Get a single lab result by result id (uuid)",
    parameters: paramsFrom(labResultParamSchema, "path", true),
    security: [{ bearerAuth: [] }],
    responses: { "200": jsonResponse("OK", "LabResult") },
   },
  },
 },
};

export const options: Record<string, unknown> = {
 explorer: true,
 customSiteTitle: "E-Dokita EMR API Docs",
};

export default spec;
