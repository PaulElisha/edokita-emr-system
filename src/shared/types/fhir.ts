/**
 * FHIR R4 types re-exported from `@types/fhir` (ambient `fhir4` namespace) under
 * the `Fhir*` aliases used across the OpenEMR gateway.
 */
export type FhirAllergyIntolerance = fhir4.AllergyIntolerance;
export type FhirAddress = fhir4.Address;
export type FhirAppointment = fhir4.Appointment;
export type FhirBundle = fhir4.Bundle;
export type FhirEntry = fhir4.BundleEntry;
export type FhirCodeableConcept = fhir4.CodeableConcept;
export type FhirCondition = fhir4.Condition;
export type FhirEncounter = fhir4.Encounter;
export type FhirHumanName = fhir4.HumanName;
export type FhirImmunization = fhir4.Immunization;
export type FhirMedicationRequest = fhir4.MedicationRequest;
export type FhirObservation = fhir4.Observation;
export type FhirObservationComponent = fhir4.ObservationComponent;
export type FhirOperationOutcome = fhir4.OperationOutcome;
export type FhirErrorDetails = fhir4.OperationOutcomeIssue;
export type FhirPatient = fhir4.Patient;
export type FhirPractitioner = fhir4.Practitioner;
export type FhirProcedure = fhir4.Procedure;
export type FhirQuantity = fhir4.Quantity;
export type FhirReference = fhir4.Reference;
export type FhirResource = fhir4.Resource;
export type FhirValueSet = fhir4.ValueSet;

/** The "clinical list" resources the EMR gateway reads and normalizes. */
export type FhirClinicalResource =
 | fhir4.Condition
 | fhir4.AllergyIntolerance
 | fhir4.MedicationRequest
 | fhir4.Immunization
 | fhir4.Procedure;
