<?php

namespace OpenEMR\RestControllers;

use OpenEMR\Common\Http\HttpRestRequest;
use OpenEMR\Services\ClinicalObservationService;

class ObservationRestController
{
    private ClinicalObservationService $service;

    public function __construct()
    {
        $this->service = new ClinicalObservationService();
    }

    public function getObservations(HttpRestRequest $request, array $searchParams)
    {
        $search = $searchParams;
        if ($request->isPatientRequest()) {
            $search['patient_uuid'] = $request->getPatientUUIDString();
        }
        $processingResult = $this->service->getObservations($search);
        return RestControllerHelper::createProcessingResultResponse($request, $processingResult, 200, true);
    }

    public function getObservation(HttpRestRequest $request, $observationUuid)
    {
        $search = ['observation_uuid' => $observationUuid];
        if ($request->isPatientRequest()) {
            $search['patient_uuid'] = $request->getPatientUUIDString();
        }
        $processingResult = $this->service->getObservations($search);
        return RestControllerHelper::createProcessingResultResponse($request, $processingResult, 200, false);
    }

    public function createObservation(HttpRestRequest $request, array $data)
    {
        if ($request->isPatientRequest()) {
            $data['patient_uuid'] = $request->getPatientUUIDString();
        }
        $this->applySessionUser($request, $data);
        $processingResult = $this->service->createObservation($data);
        return RestControllerHelper::createProcessingResultResponse($request, $processingResult, 201, false);
    }

    public function updateObservation(HttpRestRequest $request, $observationUuid, array $data)
    {
        $data['observation_uuid'] = $observationUuid;
        if ($request->isPatientRequest()) {
            $data['patient_uuid'] = $request->getPatientUUIDString();
        }
        $this->applySessionUser($request, $data);
        $processingResult = $this->service->updateObservation($data);
        return RestControllerHelper::createProcessingResultResponse($request, $processingResult, 200, false);
    }

    public function deleteObservation(HttpRestRequest $request, $observationUuid)
    {
        $search = ['observation_uuid' => $observationUuid];
        if ($request->isPatientRequest()) {
            $search['patient_uuid'] = $request->getPatientUUIDString();
        }
        $processingResult = $this->service->deleteObservation($search);
        return RestControllerHelper::createProcessingResultResponse($request, $processingResult, 200, false);
    }

    private function applySessionUser(HttpRestRequest $request, array &$data): void
    {
        $session = $request->getSession();
        $data['user'] = $data['user'] ?? $session->get('authUser');
        $data['groupname'] = $data['groupname'] ?? $session->get('authProvider');
        $data['authorized'] = $data['authorized'] ?? ($session->get('userauthorized') ?? 0);
    }
}
