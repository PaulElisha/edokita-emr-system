import asyncHandler from "@middleware/async-handler.ts";
import type { OpenEMRRequest } from "@shared/http.ts";
import { actor } from "@module/auth/helper.ts";
import type { Response } from "express";
import LabService, {
 type CreateLabOrderInput,
 type CreateLabResultInput,
 type LabOrderListQuery,
 type LabResultListQuery,
} from "@module/lab/lab.service.ts";

class LabController {
 listOrders = asyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, unknown, LabOrderListQuery>,
   res: Response,
  ) => {
   const [data, err] = await LabService.listOrders(
    req.openemr,
    req.query,
    actor(req),
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createOrder = asyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, CreateLabOrderInput>,
   res: Response,
  ) => {
   const [data, err] = await LabService.createOrder(
    req.openemr,
    req.body,
    actor(req),
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 listResults = asyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, unknown, LabResultListQuery>,
   res: Response,
  ) => {
   const [data, err] = await LabService.listResults(
    req.openemr,
    req.query,
    actor(req),
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createResult = asyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, CreateLabResultInput>,
   res: Response,
  ) => {
   const [data, err] = await LabService.createResult(
    req.openemr,
    req.body,
    actor(req),
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );
}

export default new LabController();
