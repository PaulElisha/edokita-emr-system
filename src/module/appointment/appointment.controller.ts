import asyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { OpenEMRRequest } from "@shared/http.ts";
import { actor } from "@module/auth/helper.ts";
import type { Request, Response } from "express";
import AppointmentService, {
 type AppointmentListQuery,
 type CreateAppointmentInput,
 type SlotsQuery,
 type UpdateAppointmentInput,
} from "@module/appointment/appointment.service.ts";

class AppointmentController {
 getAppointments = asyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, unknown, AppointmentListQuery>,
   res: Response,
  ) => {
   const [data, err] = await AppointmentService.getAppointments(
    req.openemr,
    req.query,
    actor(req),
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 categories = asyncHandler(async (_req: Request, res: Response) => {
  const [data, err] = await AppointmentService.categories();
  if (err) throw err;
  res.json({ success: true, data });
 });

 slots = asyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, unknown, SlotsQuery>,
   res: Response,
  ) => {
   const [data, err] = await AppointmentService.slots(req.openemr, req.query);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 getAppointment = asyncHandler(
  async (req: OpenEMRRequest<IdParam>, res: Response) => {
   const [data, err] = await AppointmentService.getAppointment(
    req.openemr,
    req.params.id,
    actor(req),
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 create = asyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, CreateAppointmentInput>,
   res: Response,
  ) => {
   const [data, err] = await AppointmentService.create(
    req.openemr,
    req.body,
    actor(req),
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 updateAppointment = asyncHandler(
  async (
   req: OpenEMRRequest<IdParam, unknown, UpdateAppointmentInput>,
   res: Response,
  ) => {
   const [data, err] = await AppointmentService.updateAppointment(
    req.openemr,
    req.params.id,
    req.body,
    actor(req),
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 remove = asyncHandler(async (req: OpenEMRRequest<IdParam>, res: Response) => {
  const [data, err] = await AppointmentService.remove(
   req.openemr,
   req.params.id,
   actor(req),
  );
  if (err) throw err;
  res.json({ success: true, data });
 });
}

export default new AppointmentController();
