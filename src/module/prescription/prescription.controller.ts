import AsyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { OpenEMRRequest } from "@shared/http.ts";
import type { Response } from "express";
import PrescriptionService, {
 type CreatePrescriptionInput,
 type PrescriptionListQuery,
} from "@module/prescription/prescription.service.ts";

class PrescriptionController {
 list = AsyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, unknown, PrescriptionListQuery>,
   res: Response,
  ) => {
   const [data, err] = await PrescriptionService.list(
    req.query,
    req.user,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 get = AsyncHandler(async (req: OpenEMRRequest<IdParam>, res: Response) => {
  const [data, err] = await PrescriptionService.get(
   req.params.id,
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 create = AsyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, CreatePrescriptionInput>,
   res: Response,
  ) => {
   const [data, err] = await PrescriptionService.create(
    req.body,
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 remove = AsyncHandler(
  async (
   req: OpenEMRRequest<IdParam, unknown, unknown, { patientId?: string }>,
   res: Response,
  ) => {
   const [data, err] = await PrescriptionService.remove(
    req.params.id,
    req.query.patientId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new PrescriptionController();
