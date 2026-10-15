/** @format */
import asyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { Request, Response } from "express";
import DoctorService, {
 type CreateDoctorInput,
 type DoctorListQuery,
} from "@module/doctor/doctor.service.ts";

class DoctorController {
 index = asyncHandler(
  async (
   req: Request<unknown, unknown, unknown, DoctorListQuery>,
   res: Response,
  ) => {
   const [data, err] = await DoctorService.list(req.openemr!, req.query);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 show = asyncHandler(async (req: Request<IdParam>, res: Response) => {
  const [data, err] = await DoctorService.get(req.openemr!, req.params.id);
  if (err) throw err;
  res.json({ success: true, data });
 });

 create = asyncHandler(
  async (req: Request<unknown, unknown, CreateDoctorInput>, res: Response) => {
   const [data, err] = await DoctorService.create(req.openemr!, req.body);
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 update = asyncHandler(
  async (
   req: Request<IdParam, unknown, CreateDoctorInput>,
   res: Response,
  ) => {
   const [data, err] = await DoctorService.update(
    req.openemr!,
    req.params.id,
    req.body,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new DoctorController();
