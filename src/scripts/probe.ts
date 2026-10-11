/** @format */
/** Quick connectivity probe against OpenEMR. Run: npm run probe */
import { openemr } from "../lib/openemr.ts";

async function main() {
  console.log("== OpenEMR probe ==");

  const version = await openemr.standardGet("/api/version");
  console.log("Version:", JSON.stringify(version[0] ?? version, null, 2));

  const [patients, practitioners, appointments] = await Promise.all([
    openemr.fhirSearch("Patient", { _count: 3 }),
    openemr.fhirSearch("Practitioner", { _count: 3 }),
    openemr.fhirSearch("Appointment", { _count: 3 }),
  ]);

  console.log(`Patients total: ${patients.total}`);
  console.log(`Practitioners total: ${practitioners.total}`);
  console.log(`Appointments total: ${appointments.total}`);

  const firstPatient = patients.entry?.[0]?.resource as { id?: string; name?: Array<{ given?: string[]; family?: string }> } | undefined;
  console.log("Sample patient:", firstPatient ? { id: firstPatient.id, name: firstPatient.name?.[0] } : "none");
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error("Probe failed:", e.message ?? e);
    if (e.status === 401) {
      console.error("Your token looks invalid or expired. Update OPENEMR_ACCESS_TOKEN in .env");
    }
    process.exit(1);
  });