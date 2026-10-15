/** @format */
import asyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { Request, Response } from "express";
import PatientService, {
 type CreatePatientInput,
 type PatientListQuery,
} from "@module/patient/patient.service.ts";

class PatientController {
 index = asyncHandler(
  async (
   req: Request<unknown, unknown, unknown, PatientListQuery>,
   res: Response,
  ) => {
   const [data, err] = await PatientService.list(req.openemr!, req.query);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 show = asyncHandler(async (req: Request<IdParam>, res: Response) => {
  const [data, err] = await PatientService.get(req.openemr!, req.params.id);
  if (err) throw err;
  res.json({ success: true, data });
 });

 create = asyncHandler(
  async (req: Request<unknown, unknown, CreatePatientInput>, res: Response) => {
   const [data, err] = await PatientService.create(req.openemr!, req.body);
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 update = asyncHandler(
  async (
   req: Request<IdParam, unknown, CreatePatientInput>,
   res: Response,
  ) => {
   const [data, err] = await PatientService.update(
    req.openemr!,
    req.params.id,
    req.body,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new PatientController();
