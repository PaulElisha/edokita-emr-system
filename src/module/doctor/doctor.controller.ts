import AsyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { OpenEMRRequest } from "@shared/http.ts";
import type { Response } from "express";
import DoctorService, {
 type CreateDoctorInput,
 type DoctorListQuery,
} from "@module/doctor/doctor.service.ts";

class DoctorController {
 index = AsyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, unknown, DoctorListQuery>,
   res: Response,
  ) => {
   const [data, err] = await DoctorService.list( req.query);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 show = AsyncHandler(async (req: OpenEMRRequest<IdParam>, res: Response) => {
  const [data, err] = await DoctorService.get( req.params.id);
  if (err) throw err;
  res.json({ success: true, data });
 });

 create = AsyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, CreateDoctorInput>,
   res: Response,
  ) => {
   const [data, err] = await DoctorService.create( req.body);
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 myPatients = AsyncHandler(async (req: OpenEMRRequest, res: Response) => {
  const [data, err] = await DoctorService.myPatients(
   req.user.userId,
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 update = AsyncHandler(
  async (
   req: OpenEMRRequest<IdParam, unknown, CreateDoctorInput>,
   res: Response,
  ) => {
   const [data, err] = await DoctorService.update(
    req.params.id,
    req.body,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new DoctorController();
