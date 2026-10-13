/** @format */
import { mapAppointment } from "@shared/lib/fhir-mapper.ts";
import { openemr } from "@shared/lib/openemr.ts";
import type { FhirAppointment } from "@shared/types/fhir.ts";

export interface AppointmentListQuery {
  patient?: string;
  practitioner?: string;
  date?: string;
  status?: string;
  _count?: number;
}

export interface CreateAppointmentInput {
  patientId: string;
  doctorId?: string;
  start: string;
  end?: string;
  durationMinutes?: number;
  type?: string;
  description?: string;
}

export async function listAppointments(query: AppointmentListQuery) {
  const params: Record<string, string | number> = {
    _count: query._count ?? 100,
  };
  if (query.patient) params.patient = query.patient;
  if (query.practitioner) params["actor:Practitioner"] = query.practitioner;
  if (query.date) params.date = query.date;
  if (query.status) params.status = query.status;

  const bundle = await openemr.fhirSearch("Appointment", params);
  const items = (bundle.entry ?? [])
    .map((e) => e.resource as FhirAppointment)
    .filter((r) => r?.resourceType === "Appointment")
    .map(mapAppointment);

  return { total: bundle.total ?? items.length, items };
}

export async function getAppointment(id: string) {
  const appointment = await openemr.fhirRead<FhirAppointment>("Appointment", id);
  return mapAppointment(appointment);
}

export async function createAppointment(input: CreateAppointmentInput) {
  const start = new Date(input.start).toISOString();
  const end = input.end
    ? new Date(input.end).toISOString()
    : new Date(new Date(start).getTime() + (input.durationMinutes ?? 30) * 60_000).toISOString();

  const participant: Array<Record<string, unknown>> = [
    {
      actor: { reference: `Patient/${input.patientId}`, type: "Patient" },
      status: "accepted",
    },
  ];
  if (input.doctorId) {
    participant.push({
      actor: { reference: `Practitioner/${input.doctorId}`, type: "Practitioner" },
      status: "accepted",
    });
  }

  const resource: Record<string, unknown> = {
    resourceType: "Appointment",
    status: "booked",
    start,
    end,
    appointmentType: input.type ? { text: input.type } : { text: "Visit" },
    description: input.description,
    participant,
  };

  const created = await openemr.fhirCreate<FhirAppointment>("Appointment", resource);
  return mapAppointment(created);
}