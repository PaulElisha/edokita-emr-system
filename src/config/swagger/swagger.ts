/** @format */
/** Hand-crafted OpenAPI 3.0 spec describing our own hospital-management API. */

import { Env } from "@/env.ts";

const spec = {
 openapi: "3.0.0",
 info: {
  title: "E-Dokita EMR API",
  version: Env.VERSION,
  description:
   "A hospital management gateway built on top of the OpenEMR API (standard + FHIR R4). It exposes doctors, patients, appointments, admin metrics and patient EMR records.",
 },
 servers: [{ url: Env.LOCAL_URL, description: "Local" }],
 paths: {
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
    summary: "List practitioners (search by family/given/name)",
    parameters: [{ name: "family", in: "query", schema: { type: "string" } }],
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["Doctors"],
    summary: "Create a practitioner",
    requestBody: {
     content: {
      "application/json": {
       schema: {
        type: "object",
        required: ["fname", "lname"],
        properties: {
         fname: { type: "string" },
         lname: { type: "string" },
         npi: { type: "string" },
         email: { type: "string" },
         specialty: { type: "string" },
        },
       },
      },
     },
    },
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/doctors/{id}": {
   get: {
    tags: ["Doctors"],
    summary: "Get a practitioner by id",
    parameters: [
     { name: "id", in: "path", required: true, schema: { type: "string" } },
    ],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/patients": {
   get: {
    tags: ["Patients"],
    summary: "List patients (search by given/family/gender/birthDate)",
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["Patients"],
    summary: "Create a patient",
    requestBody: {
     content: {
      "application/json": {
       schema: {
        type: "object",
        required: ["fname", "lname", "birthDate", "gender"],
        properties: {
         fname: { type: "string" },
         lname: { type: "string" },
         birthDate: { type: "string", example: "1992-02-02" },
         gender: { type: "string", example: "Male" },
         phone: { type: "string" },
         email: { type: "string" },
         street: { type: "string" },
         city: { type: "string" },
         postalCode: { type: "string" },
         countryCode: { type: "string" },
        },
       },
      },
     },
    },
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/patients/{id}": {
   get: {
    tags: ["Patients"],
    summary: "Get a patient by id",
    parameters: [
     { name: "id", in: "path", required: true, schema: { type: "string" } },
    ],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/appointments": {
   get: {
    tags: ["Appointments"],
    summary: "List appointments (filter by patient/practitioner/date/status)",
    responses: { "200": { description: "OK" } },
   },
   post: {
    tags: ["Appointments"],
    summary: "Book an appointment",
    requestBody: {
     content: {
      "application/json": {
       schema: {
        type: "object",
        required: ["patientId", "start"],
        properties: {
         patientId: { type: "string" },
         doctorId: { type: "string" },
         start: { type: "string", example: "2026-10-12T09:00:00Z" },
         durationMinutes: { type: "number", example: 30 },
         type: { type: "string" },
        },
       },
      },
     },
    },
    responses: { "201": { description: "Created" } },
   },
  },
  "/api/appointments/{id}": {
   get: {
    tags: ["Appointments"],
    summary: "Get an appointment by id",
    parameters: [
     { name: "id", in: "path", required: true, schema: { type: "string" } },
    ],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/summary": {
   get: {
    tags: ["EMR"],
    summary: "Full clinical summary for a patient",
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/clinical/{kind}": {
   get: {
    tags: ["EMR"],
    summary: "Clinical records of one kind for a patient",
    parameters: [
     {
      name: "kind",
      in: "path",
      required: true,
      schema: {
       type: "string",
       enum: [
        "conditions",
        "allergies",
        "medications",
        "immunizations",
        "procedures",
        "encounters",
       ],
      },
     },
    ],
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/vitals": {
   get: {
    tags: ["EMR"],
    summary: "Vital signs",
    responses: { "200": { description: "OK" } },
   },
  },
  "/api/emr/{patientId}/labs": {
   get: {
    tags: ["EMR"],
    summary: "Laboratory observations",
    responses: { "200": { description: "OK" } },
   },
  },
 },
};

export const options: Record<string, unknown> = {
 explorer: true,
 customSiteTitle: "E-Dokita EMR API Docs",
};

export default spec;
