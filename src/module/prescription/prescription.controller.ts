import asyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { OpenEMRRequest } from "@shared/http.ts";
import { actor } from "@module/auth/helper.ts";
import type { Response } from "express";
import PrescriptionService, {
 type CreatePrescriptionInput,
 type PrescriptionListQuery,
} from "@module/prescription/prescription.service.ts";

class PrescriptionController {
 list = asyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, unknown, PrescriptionListQuery>,
   res: Response,
  ) => {
   const [data, err] = await PrescriptionService.list(
    req.openemr,
    req.query,
    actor(req),
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 get = asyncHandler(async (req: OpenEMRRequest<IdParam>, res: Response) => {
  const [data, err] = await PrescriptionService.get(
   req.openemr,
   req.params.id,
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 create = asyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, CreatePrescriptionInput>,
   res: Response,
  ) => {
   const [data, err] = await PrescriptionService.create(
    req.openemr,
    req.body,
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 remove = asyncHandler(
  async (
   req: OpenEMRRequest<IdParam, unknown, unknown, { patientId?: string }>,
   res: Response,
  ) => {
   const [data, err] = await PrescriptionService.remove(
    req.openemr,
    req.params.id,
    req.query.patientId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new PrescriptionController();
