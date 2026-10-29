import AsyncHandler from "@middleware/async-handler.ts";
import type { OpenEMRRequest } from "@shared/http.ts";
import type { Response } from "express";
import LabService, {
 type CreateLabOrderInput,
 type CreateLabResultInput,
 type LabOrderListQuery,
 type LabResultListQuery,
 type LabResultParam,
} from "@module/lab/lab.service.ts";

class LabController {
 listOrders = AsyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, unknown, LabOrderListQuery>,
   res: Response,
  ) => {
   const [data, err] = await LabService.listOrders(
    req.query,
    req.user,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createOrder = AsyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, CreateLabOrderInput>,
   res: Response,
  ) => {
   const [data, err] = await LabService.createOrder(
    req.body,
    req.user,
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 listResults = AsyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, unknown, LabResultListQuery>,
   res: Response,
  ) => {
   const [data, err] = await LabService.listResults(
    req.query,
    req.user,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 getResult = AsyncHandler(
  async (req: OpenEMRRequest<LabResultParam>, res: Response) => {
   const [data, err] = await LabService.getResult(
    req.params.resultId,
    req.user,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );

 createResult = AsyncHandler(
  async (
   req: OpenEMRRequest<unknown, unknown, CreateLabResultInput>,
   res: Response,
  ) => {
   const [data, err] = await LabService.createResult(
    req.body,
    req.user,
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );
}

export default new LabController();
