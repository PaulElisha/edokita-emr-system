/** @format */

import AsyncHandler from "@middleware/async-handler.ts";
import type { IdParam } from "@shared/schemas/params.ts";
import type { OpenEMRRequest } from "@shared/http.ts";
import type { Request, Response } from "express";
import AppointmentService, {
 type AppointmentListQuery,
 type CreateAppointmentInput,
 type RescheduleAppointmentInput,
 type SlotsQuery,
 type UpdateAppointmentInput,
} from "@module/appointment/appointment.service.ts";

class AppointmentController {
 getAppointments = AsyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, unknown, AppointmentListQuery>,
   res: Response,
  ) => {
   const [data, err] = await AppointmentService.getAppointments(
    req.query,
    req.user,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 categories = AsyncHandler(async (_req: Request, res: Response) => {
  const [data, err] = await AppointmentService.categories();
  if (err) throw err;
  res.json({ success: true, data });
 });

 slots = AsyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, unknown, SlotsQuery>,
   res: Response,
  ) => {
   const [data, err] = await AppointmentService.slots(req.query);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 getAppointment = AsyncHandler(
  async (req: OpenEMRRequest<IdParam>, res: Response) => {
   const [data, err] = await AppointmentService.getAppointment(req.params.id);
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 create = AsyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, CreateAppointmentInput>,
   res: Response,
  ) => {
   const [data, err] = await AppointmentService.create(req.body, req.user);
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 updateAppointment = AsyncHandler(
  async (
   req: OpenEMRRequest<IdParam, unknown, UpdateAppointmentInput>,
   res: Response,
  ) => {
   const [data, err] = await AppointmentService.updateAppointment(
    req.params.id,
    req.body,
    req.user.id,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 accept = AsyncHandler(async (req: OpenEMRRequest<IdParam>, res: Response) => {
  const [data, err] = await AppointmentService.accept(
   req.params.id,
   req.user.id,
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 confirm = AsyncHandler(async (req: OpenEMRRequest<IdParam>, res: Response) => {
  const [data, err] = await AppointmentService.confirm(
   req.params.id,
   req.user.id,
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 reschedule = AsyncHandler(
  async (
   req: OpenEMRRequest<IdParam, unknown, RescheduleAppointmentInput>,
   res: Response,
  ) => {
   const [data, err] = await AppointmentService.reschedule(
    req.params.id,
    req.body,
    req.user.id,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 done = AsyncHandler(async (req: OpenEMRRequest<IdParam>, res: Response) => {
  const [data, err] = await AppointmentService.done(req.params.id, req.user.id);
  if (err) throw err;
  res.json({ success: true, data });
 });

 cancel = AsyncHandler(async (req: OpenEMRRequest<IdParam>, res: Response) => {
  const [data, err] = await AppointmentService.cancel(
   req.params.id,
   req.user.id,
  );
  if (err) throw err;
  res.json({ success: true, data });
 });

 remove = AsyncHandler(async (req: OpenEMRRequest<IdParam>, res: Response) => {
  const [data, err] = await AppointmentService.remove(req.params.id, req.user);
  if (err) throw err;
  res.json({ success: true, data });
 });
}

export default new AppointmentController();
