<?php

namespace OpenEMR\Services;

use OpenEMR\Common\Database\QueryUtils;
use OpenEMR\Common\Uuid\UuidRegistry;
use OpenEMR\Services\Utils\DateFormatterUtils;
use OpenEMR\Validators\ProcessingResult;

class ClinicalObservationService
{
    private ObservationService $observations;

    public function __construct()
    {
        $this->observations = new ObservationService();
    }

    public function getObservations(array $search): ProcessingResult
    {
        $result = new ProcessingResult();

        $patientId = $this->resolvePatientId($search);
        if ($patientId === false) {
            $result->setValidationMessages(['patient' => ['A valid patient is required.']]);
            return $result;
        }

        $observationId = $this->resolveObservationId($search);
        if (!$patientId && !$observationId) {
            $result->setValidationMessages(['patient' => ['A patient or observation is required.']]);
            return $result;
        }

        $where = ['fo.activity = 1', 'fo.parent_observation_id IS NULL'];
        $binds = [];

        if ($patientId) {
            $where[] = 'fo.pid = ?';
            $binds[] = $patientId;
        }
        if ($observationId) {
            $where[] = 'fo.id = ?';
            $binds[] = $observationId;
        }

        $encounterId = $this->resolveEncounterId($search);
        if ($encounterId !== '') {
            $where[] = 'fo.encounter = ?';
            $binds[] = $encounterId;
        }
        if (!empty($search['category'])) {
            $where[] = 'fo.category = ?';
            $binds[] = (string)$search['category'];
        }
        if (!empty($search['ob_type'])) {
            $where[] = 'fo.ob_type = ?';
            $binds[] = (string)$search['ob_type'];
        }

        $sql = "SELECT fo.*, p.uuid AS puuid, e.uuid AS euuid, u.uuid AS provider_uuid "
            . "FROM form_observation AS fo "
            . "LEFT JOIN patient_data AS p ON p.pid = fo.pid "
            . "LEFT JOIN form_encounter AS e ON e.encounter = fo.encounter "
            . "LEFT JOIN users AS u ON u.username = fo.user "
            . "WHERE " . implode(' AND ', $where) . " "
            . "ORDER BY fo.date DESC, fo.id DESC";

        foreach (QueryUtils::fetchRecords($sql, $binds) as $row) {
            $result->addData($this->formatObservation($row));
        }

        return $result;
    }

    public function createObservation(array $data): ProcessingResult
    {
        $result = new ProcessingResult();

        $patientId = $this->resolvePatientId($data);
        if (!$patientId) {
            $result->setValidationMessages(['patient' => ['A valid patient is required.']]);
            return $result;
        }
        $encounterId = $this->resolveEncounterId($data);
        if ($encounterId === '') {
            $result->setValidationMessages(['encounter' => ['A valid encounter is required.']]);
            return $result;
        }
        if (trim((string)($data['code'] ?? '')) === '') {
            $result->setValidationMessages(['code' => ['A code is required.']]);
            return $result;
        }
        if (trim((string)($data['description'] ?? '')) === '') {
            $result->setValidationMessages(['description' => ['A description is required.']]);
            return $result;
        }

        $payload = $this->buildPayload($data, $patientId, $encounterId);

        try {
            $saved = $this->observations->saveObservation($payload);
        } catch (\Throwable $e) {
            $result->addInternalError('Failed to save observation: ' . $e->getMessage());
            return $result;
        }

        return $this->fetchResult((int)($saved['id'] ?? 0), $patientId);
    }

    public function updateObservation(array $data): ProcessingResult
    {
        $result = new ProcessingResult();

        $observationId = $this->resolveObservationId($data);
        if (!$observationId) {
            $result->setValidationMessages(['observation' => ['A valid observation is required.']]);
            return $result;
        }

        $requestedPatient = $this->resolvePatientId($data);
        $existing = $this->findObservationRow($observationId, $requestedPatient);
        if ($existing === null) {
            $result->setValidationMessages(['observation' => ['Observation not found.']]);
            return $result;
        }

        $patientId = (int)$existing['pid'];
        $merged = $existing;
        foreach ($data as $key => $value) {
            if ($value !== null && $value !== '') {
                $merged[$key] = $value;
            }
        }
        $encounterId = $this->resolveEncounterId($data);
        if ($encounterId === '') {
            $encounterId = (string)$existing['encounter'];
        }

        $payload = $this->buildPayload($merged, $patientId, $encounterId);
        $payload['id'] = $observationId;
        $payload['form_id'] = (int)$existing['form_id'];

        try {
            $this->observations->saveObservation($payload);
        } catch (\Throwable $e) {
            $result->addInternalError('Failed to update observation: ' . $e->getMessage());
            return $result;
        }

        return $this->fetchResult($observationId, $patientId);
    }

    public function deleteObservation(array $search): ProcessingResult
    {
        $result = new ProcessingResult();

        $observationId = $this->resolveObservationId($search);
        if (!$observationId) {
            $result->setValidationMessages(['observation' => ['A valid observation is required.']]);
            return $result;
        }

        $requestedPatient = $this->resolvePatientId($search);
        $existing = $this->findObservationRow($observationId, $requestedPatient);
        if ($existing === null) {
            $result->setValidationMessages(['observation' => ['Observation not found.']]);
            return $result;
        }

        try {
            $this->observations->deleteObservationById(
                (int)$existing['id'],
                (int)$existing['form_id'],
                (int)$existing['pid'],
                (int)$existing['encounter']
            );
        } catch (\Throwable $e) {
            $result->addInternalError('Failed to delete observation: ' . $e->getMessage());
            return $result;
        }

        $result->addData(['id' => (int)$existing['id'], 'deleted' => true]);
        return $result;
    }

    private function buildPayload(array $data, int $patientId, string $encounterId): array
    {
        return [
            'pid' => $patientId,
            'encounter' => $encounterId,
            'user' => (string)($data['user'] ?? ''),
            'groupname' => (string)($data['groupname'] ?? ''),
            'authorized' => (int)($data['authorized'] ?? 0),
            'code' => (string)($data['code'] ?? ''),
            'code_type' => (string)($data['code_type'] ?? ''),
            'description' => (string)($data['description'] ?? ''),
            'observation' => (string)($data['observation'] ?? ''),
            'table_code' => (string)($data['table_code'] ?? ''),
            'ob_type' => (string)($data['ob_type'] ?? ''),
            'ob_status' => (string)($data['ob_status'] ?? ''),
            'ob_value' => (string)($data['ob_value'] ?? ''),
            'ob_unit' => (string)($data['ob_unit'] ?? ''),
            'ob_reason_code' => (string)($data['ob_reason_code'] ?? ''),
            'ob_reason_status' => (string)($data['ob_reason_status'] ?? ''),
            'ob_reason_text' => (string)($data['ob_reason_text'] ?? ''),
            'category' => (string)($data['category'] ?? ''),
            'date' => $this->normalizeDate($data['date'] ?? null) ?? date('Y-m-d H:i:s'),
            'date_end' => $this->normalizeDate($data['date_end'] ?? null),
            'questionnaire_response_id' => !empty($data['questionnaire_response_id'])
                ? (int)$data['questionnaire_response_id']
                : null,
        ];
    }

    private function normalizeDate($value): ?string
    {
        if (empty($value)) {
            return null;
        }
        $dateTime = DateFormatterUtils::dateStringToDateTime((string)$value);
        if ($dateTime === false) {
            return (string)$value;
        }
        return $dateTime->format('Y-m-d H:i:s');
    }

    private function fetchResult(int $id, int $patientId): ProcessingResult
    {
        return $this->getObservations(['observation_id' => $id, 'patient_id' => $patientId]);
    }

    private function findObservationRow(int $id, $patientId): ?array
    {
        $sql = "SELECT * FROM form_observation WHERE id = ?";
        $binds = [$id];
        if ($patientId) {
            $sql .= " AND pid = ?";
            $binds[] = $patientId;
        }
        $rows = QueryUtils::fetchRecords($sql, $binds);
        return $rows[0] ?? null;
    }

    private function formatObservation(array $row): array
    {
        $row['observation_uuid'] = $this->uuidToString($row['uuid'] ?? null);
        $row['patient_uuid'] = $this->uuidToString($row['puuid'] ?? null);
        $row['encounter_uuid'] = $this->uuidToString($row['euuid'] ?? null);
        $row['provider_uuid'] = $this->uuidToString($row['provider_uuid'] ?? null);
        unset($row['uuid'], $row['puuid'], $row['euuid']);
        return $row;
    }

    private function resolvePatientId(array $data)
    {
        $pid = $data['patient_id'] ?? $data['pid'] ?? null;
        if ($pid !== null && $pid !== '') {
            $found = QueryUtils::fetchSingleValue(
                "SELECT pid FROM patient_data WHERE pid = ?",
                'pid',
                [(int)$pid]
            );
            return $found === null ? false : (int)$found;
        }
        $uuid = $data['patient_uuid'] ?? $data['puuid'] ?? null;
        if ($uuid !== null && $uuid !== '') {
            $found = QueryUtils::fetchSingleValue(
                "SELECT pid FROM patient_data WHERE uuid = ?",
                'pid',
                [UuidRegistry::uuidToBytes((string)$uuid)]
            );
            return $found === null ? false : (int)$found;
        }
        return null;
    }

    private function resolveEncounterId(array $data): string
    {
        $id = $data['encounter_id'] ?? $data['encounter'] ?? $data['eid'] ?? null;
        if ($id !== null && $id !== '') {
            return (string)$id;
        }
        $uuid = $data['encounter_uuid'] ?? $data['euuid'] ?? null;
        if ($uuid !== null && $uuid !== '') {
            $found = QueryUtils::fetchSingleValue(
                "SELECT encounter FROM form_encounter WHERE uuid = ?",
                'encounter',
                [UuidRegistry::uuidToBytes((string)$uuid)]
            );
            return $found === null ? '' : (string)$found;
        }
        return '';
    }

    private function resolveObservationId(array $data): int
    {
        $id = $data['observation_id'] ?? $data['id'] ?? null;
        if ($id !== null && $id !== '') {
            return (int)$id;
        }
        $uuid = $data['observation_uuid'] ?? null;
        if ($uuid !== null && $uuid !== '') {
            $found = QueryUtils::fetchSingleValue(
                "SELECT id FROM form_observation WHERE uuid = ?",
                'id',
                [UuidRegistry::uuidToBytes((string)$uuid)]
            );
            return $found === null ? 0 : (int)$found;
        }
        return 0;
    }

    private function uuidToString(?string $uuid): ?string
    {
        if (empty($uuid)) {
            return null;
        }
        return UuidRegistry::uuidToString($uuid);
    }
}
