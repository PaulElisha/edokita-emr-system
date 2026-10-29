/** @format */

import AsyncHandler from "@middleware/async-handler.ts";
import type { OpenEMRRequest } from "@shared/http.ts";
import type { Response } from "express";
import EmrAccessService, {
 type EmrAccessPatientParam,
 type EmrAccessRequestInput,
 type EmrAccessRequestParam,
 type EmrAccessReviewInput,
} from "@module/emr-access/emr-access.service.ts";

class EmrAccessController {
 request = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrAccessPatientParam, unknown, EmrAccessRequestInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrAccessService.request(
    req.params.patientId,
    req.user,
    req.body,
   );
   if (err) throw err;
   res.status(201).json({ success: true, data });
  },
 );

 list = AsyncHandler(async (req: OpenEMRRequest, res: Response) => {
  const [data, err] = await EmrAccessService.list(req.user);
  if (err) throw err;
  res.json({ success: true, data });
 });

 review = AsyncHandler(
  async (
   req: OpenEMRRequest<EmrAccessRequestParam, unknown, EmrAccessReviewInput>,
   res: Response,
  ) => {
   const [data, err] = await EmrAccessService.review(
    req.params.requestId,
    req.user,
    req.body,
   );
   if (err) throw err;
   res.json({ success: true, data });
  },
 );
}

export default new EmrAccessController();
