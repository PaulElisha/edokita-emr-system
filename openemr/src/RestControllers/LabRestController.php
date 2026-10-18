<?php

namespace OpenEMR\RestControllers;

use OpenEMR\Common\Http\HttpRestRequest;
use OpenEMR\Services\LabService;

class LabRestController
{
    private LabService $service;

    public function __construct()
    {
        $this->service = new LabService();
    }

    public function getOrders(HttpRestRequest $request, array $searchParams)
    {
        $search = $searchParams;
        if ($request->isPatientRequest()) {
            $search['patient_uuid'] = $request->getPatientUUIDString();
        }
        $processingResult = $this->service->getOrders($search);
        return RestControllerHelper::createProcessingResultResponse($request, $processingResult, 200, true);
    }

    public function createOrder(HttpRestRequest $request, array $data)
    {
        if ($request->isPatientRequest()) {
            $data['patient_uuid'] = $request->getPatientUUIDString();
        }
        if (empty($data['provider_id']) && empty($data['provider_uuid'])) {
            $data['provider_id'] = $request->getRequestUserId();
        }
        $processingResult = $this->service->createOrder($data);
        return RestControllerHelper::createProcessingResultResponse($request, $processingResult, 201, false);
    }

    public function getResults(HttpRestRequest $request, array $searchParams)
    {
        $search = $searchParams;
        if ($request->isPatientRequest()) {
            $search['patient_uuid'] = $request->getPatientUUIDString();
        }
        $processingResult = $this->service->getResults($search);
        return RestControllerHelper::createProcessingResultResponse($request, $processingResult, 200, true);
    }

    public function createResult(HttpRestRequest $request, array $data)
    {
        $processingResult = $this->service->createResult($data);
        return RestControllerHelper::createProcessingResultResponse($request, $processingResult, 201, false);
    }
}
