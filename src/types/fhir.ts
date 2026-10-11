/** Minimal FHIR R4 types sufficient for the OpenEMR gateway. */
export interface FhirBundle {
  resourceType: "Bundle";
  type?: string;
  total?: number;
  entry?: FhirEntry[];
  link?: Array<{ relation: string; url: string }>;
}

export interface FhirEntry {
  fullUrl?: string;
  resource?: FhirResource;
}

export interface FhirResource {
  resourceType: string;
  id?: string;
  [key: string]: unknown;
}

export interface FhirHumanName {
  use?: string;
  family?: string;
  given?: string[];
  text?: string;
}

export interface FhirCodeableConcept {
  text?: string;
  coding?: Array<{ system?: string; code?: string; display?: string }>;
}

export interface FhirReference {
  reference?: string;
  display?: string;
  type?: string;
}

export interface FhirErrorDetails {
  severity?: string;
  code?: string;
  diagnostics?: string;
}

export interface FhirOperationOutcome extends FhirResource {
  issue?: FhirErrorDetails[];
}

export interface FhirPatient extends FhirResource {
  name?: FhirHumanName[];
  gender?: string;
  birthDate?: string;
  telecom?: Array<{ system?: string; value?: string; use?: string }>;
  address?: Array<{
    line?: string[];
    city?: string;
    state?: string;
    postalCode?: string;
    country?: string;
    use?: string;
  }>;
  managingOrganization?: FhirReference;
  active?: boolean;
}

export interface FhirPractitioner extends FhirResource {
  name?: FhirHumanName[];
  telecom?: Array<{ system?: string; value?: string; use?: string }>;
  qualification?: Array<{
    identifier?: { system?: string; value?: string };
    code?: FhirCodeableConcept;
    period?: { start?: string; end?: string };
  }>;
  active?: boolean;
}

export interface FhirAppointment extends FhirResource {
  status?: string;
  start?: string;
  end?: string;
  appointmentType?: FhirCodeableConcept;
  description?: string;
  participant?: Array<{
    actor?: FhirReference;
    status?: string;
    type?: FhirCodeableConcept[];
  }>;
}

export interface FhirObservation extends FhirClinicalResource {
  value?: {
    value?: number | string;
    unit?: string;
  };
}

export interface FhirEncounter extends FhirResource {
  status?: string;
  class?: FhirCodeableConcept;
  type?: FhirCodeableConcept[];
  reasonCode?: FhirCodeableConcept[];
  period?: { start?: string; end?: string };
  subject?: FhirReference;
}

export interface FhirClinicalResource extends FhirResource {
  code?: FhirCodeableConcept;
  clinicalStatus?: FhirCodeableConcept;
  verificationStatus?: FhirCodeableConcept;
  onset?: FhirResource | string;
  recordedDate?: string;
  occurrence?: FhirResource | string;
  performed?: FhirResource | string;
  effective?: FhirResource | string;
  status?: string;
  category?: FhirCodeableConcept[];
  subject?: FhirReference;
  encounter?: FhirReference;
  value?: { value?: number | string; unit?: string };
}