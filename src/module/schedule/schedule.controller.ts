import asyncHandler from "@middleware/async-handler.ts";
import type { Request, Response } from "express";
import ScheduleService, {
 type PractitionerParam,
 type UpdateScheduleInput,
} from "@module/schedule/schedule.service.ts";

class ScheduleController {
 list = asyncHandler(
  async (req: Request<PractitionerParam>, res: Response) => {
   const [data, err] = await ScheduleService.list(
    req.params.practitionerId,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 updateSchedule = asyncHandler(
  async (
   req: Request<PractitionerParam, unknown, UpdateScheduleInput>,
   res: Response,
  ) => {
   const [data, err] = await ScheduleService.updateSchedule(
    req.params.practitionerId,
    req.body,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new ScheduleController();
