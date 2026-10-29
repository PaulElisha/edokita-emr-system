export type FhirAddress = fhir4.Address;
export type FhirAppointment = fhir4.Appointment;
export type FhirBundle = fhir4.Bundle;
export type FhirCodeableConcept = fhir4.CodeableConcept;
export type FhirEncounter = fhir4.Encounter;
export type FhirHumanName = fhir4.HumanName;
export type FhirObservation = fhir4.Observation;
export type FhirPatient = fhir4.Patient;
export type FhirPractitioner = fhir4.Practitioner;
export type FhirQuantity = fhir4.Quantity;
export type FhirReference = fhir4.Reference;
export type FhirResource = fhir4.Resource;
export type FhirValueSet = fhir4.ValueSet;

export type FhirClinicalResource =
 | fhir4.Condition
 | fhir4.AllergyIntolerance
 | fhir4.MedicationRequest
 | fhir4.Immunization
 | fhir4.Procedure;
