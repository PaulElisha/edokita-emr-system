<?php

namespace OpenEMR\Services;

use OpenEMR\Common\Database\QueryUtils;
use OpenEMR\Common\Uuid\UuidRegistry;
use OpenEMR\Validators\ProcessingResult;

class LabService
{
    public function getOrders(array $search): ProcessingResult
    {
        $result = new ProcessingResult();

        $patientId = $this->resolvePatientId($search);
        if ($patientId === false) {
            $result->setValidationMessages(['patient' => ['A valid patient is required.']]);
            return $result;
        }

        $where = ['po.activity = 1'];
        $binds = [];
        if ($patientId) {
            $where[] = 'po.patient_id = ?';
            $binds[] = $patientId;
        }
        $orderId = $this->resolveOrderId($search);
        if ($orderId) {
            $where[] = 'po.procedure_order_id = ?';
            $binds[] = $orderId;
        }
        if (!empty($search['status'])) {
            $where[] = 'po.order_status = ?';
            $binds[] = (string)$search['status'];
        }

        $sql = "SELECT po.*, p.uuid AS puuid, e.uuid AS euuid, "
            . "u.uuid AS provider_uuid, pp.name AS lab_name "
            . "FROM procedure_order AS po "
            . "LEFT JOIN patient_data AS p ON p.pid = po.patient_id "
            . "LEFT JOIN form_encounter AS e ON e.encounter = po.encounter_id "
            . "LEFT JOIN users AS u ON u.id = po.provider_id "
            . "LEFT JOIN procedure_providers AS pp ON pp.ppid = po.lab_id "
            . "WHERE " . implode(' AND ', $where) . " "
            . "ORDER BY po.date_ordered DESC, po.procedure_order_id DESC";

        foreach (QueryUtils::fetchRecords($sql, $binds) as $row) {
            $row['order_uuid'] = $this->uuidToString($row['uuid'] ?? null);
            $row['puuid'] = $this->uuidToString($row['puuid'] ?? null);
            $row['euuid'] = $this->uuidToString($row['euuid'] ?? null);
            $row['provider_uuid'] = $this->uuidToString($row['provider_uuid'] ?? null);
            $row['order_codes'] = QueryUtils::fetchRecords(
                "SELECT procedure_order_seq, procedure_code, procedure_name, procedure_type "
                . "FROM procedure_order_code WHERE procedure_order_id = ? "
                . "ORDER BY procedure_order_seq",
                [$row['procedure_order_id']]
            );
            unset($row['uuid']);
            $result->addData($row);
        }

        return $result;
    }

    public function createOrder(array $data): ProcessingResult
    {
        $result = new ProcessingResult();

        $patientId = $this->resolvePatientId($data);
        if (!$patientId) {
            $result->setValidationMessages(['patient' => ['A valid patient is required.']]);
            return $result;
        }
        $providerId = $this->resolveProviderId($data);
        if (!$providerId) {
            $result->setValidationMessages(['provider' => ['A valid ordering provider is required.']]);
            return $result;
        }
        $code = trim((string)($data['order_code'] ?? ''));
        if ($code === '') {
            $result->setValidationMessages(['order_code' => ['An order code is required.']]);
            return $result;
        }

        $name = trim((string)($data['order_name'] ?? '')) ?: $code;
        $labId = $this->resolveLabId($data);
        $encounterId = (int)($data['encounter_id'] ?? 0);
        $dateOrdered = !empty($data['date_ordered']) ? (string)$data['date_ordered'] : date('Y-m-d H:i:s');
        $dateCollected = !empty($data['date_collected']) ? (string)$data['date_collected'] : null;
        $priority = !empty($data['order_priority']) ? (string)$data['order_priority'] : 'routine';
        $instructions = (string)($data['patient_instructions'] ?? '');
        $procedureType = !empty($data['procedure_type']) ? (string)$data['procedure_type'] : 'laboratory_test';

        try {
            $orderId = QueryUtils::inTransaction(function () use (
                $patientId,
                $providerId,
                $labId,
                $encounterId,
                $dateOrdered,
                $dateCollected,
                $priority,
                $instructions,
                $procedureType,
                $code,
                $name
            ) {
                $orderId = QueryUtils::sqlInsert(
                    "INSERT INTO procedure_order "
                    . "(provider_id, patient_id, encounter_id, date_ordered, date_collected, "
                    . "order_priority, order_status, lab_id, patient_instructions, procedure_order_type) "
                    . "VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)",
                    [
                        $providerId,
                        $patientId,
                        $encounterId,
                        $dateOrdered,
                        $dateCollected,
                        $priority,
                        $labId,
                        $instructions,
                        $procedureType,
                    ]
                );
                UuidRegistry::createMissingUuidForRow('procedure_order', 'procedure_order_id', $orderId);

                QueryUtils::sqlInsert(
                    "INSERT INTO procedure_order_code "
                    . "(procedure_order_id, procedure_order_seq, procedure_code, procedure_name, "
                    . "procedure_source, procedure_order_title, procedure_type) "
                    . "VALUES (?, 1, ?, ?, '1', ?, ?)",
                    [$orderId, $code, $name, $name, $procedureType]
                );

                return $orderId;
            });
        } catch (\Throwable $e) {
            $result->addInternalError('Failed to create procedure order: ' . $e->getMessage());
            return $result;
        }

        $orderUuid = QueryUtils::fetchSingleValue(
            "SELECT uuid FROM procedure_order WHERE procedure_order_id = ?",
            'uuid',
            [$orderId]
        );
        $patientUuid = QueryUtils::fetchSingleValue(
            "SELECT uuid FROM patient_data WHERE pid = ?",
            'uuid',
            [$patientId]
        );

        $result->addData([
            'order_id' => $orderId,
            'order_uuid' => $this->uuidToString($orderUuid),
            'patient_id' => $patientId,
            'patient_uuid' => $this->uuidToString($patientUuid),
            'provider_id' => $providerId,
            'order_code' => $code,
            'order_name' => $name,
            'order_status' => 'pending',
            'date_ordered' => $dateOrdered,
        ]);

        return $result;
    }

    public function getResults(array $search): ProcessingResult
    {
        $result = new ProcessingResult();

        $orderId = $this->resolveOrderId($search);
        $patientId = $this->resolvePatientId($search);
        $resultId = $this->resolveResultId($search);
        $providerId = $this->resolveProviderId($search);
        if ($patientId === false) {
            $result->setValidationMessages(['patient' => ['The patient is invalid.']]);
            return $result;
        }
        if (!$orderId && !$patientId && !$resultId && !$providerId) {
            $result->setValidationMessages(['order_id' => ['An order, patient, result or provider is required.']]);
            return $result;
        }

        $where = ['1 = 1'];
        $binds = [];
        if ($orderId) {
            $where[] = 'preport.procedure_order_id = ?';
            $binds[] = $orderId;
        }
        if ($patientId) {
            $where[] = 'po.patient_id = ?';
            $binds[] = $patientId;
        }
        if ($resultId) {
            $where[] = 'pr.procedure_result_id = ?';
            $binds[] = $resultId;
        }
        if ($providerId) {
            $where[] = 'po.provider_id = ?';
            $binds[] = $providerId;
        }

        $sql = "SELECT pr.procedure_result_id, pr.uuid, pr.result_code, pr.result_text, "
            . "pr.result, pr.units, pr.range, pr.abnormal, pr.result_status, pr.date, pr.comments, "
            . "preport.procedure_report_id, preport.procedure_order_id, preport.date_report, "
            . "preport.report_status, preport.review_status, po.patient_id, po.provider_id, "
            . "prov.uuid AS provider_uuid "
            . "FROM procedure_result AS pr "
            . "JOIN procedure_report AS preport ON preport.procedure_report_id = pr.procedure_report_id "
            . "JOIN procedure_order AS po ON po.procedure_order_id = preport.procedure_order_id "
            . "LEFT JOIN users AS prov ON prov.id = po.provider_id "
            . "WHERE " . implode(' AND ', $where) . " "
            . "ORDER BY preport.date_report DESC, pr.procedure_result_id";

        foreach (QueryUtils::fetchRecords($sql, $binds) as $row) {
            $row['result_uuid'] = $this->uuidToString($row['uuid'] ?? null);
            $row['provider_uuid'] = $this->uuidToString($row['provider_uuid'] ?? null);
            unset($row['uuid']);
            $result->addData($row);
        }

        return $result;
    }

    public function createResult(array $data): ProcessingResult
    {
        $result = new ProcessingResult();

        $orderId = $this->resolveOrderId($data);
        if (!$orderId) {
            $result->setValidationMessages(['order_id' => ['A valid order is required.']]);
            return $result;
        }
        $rows = $data['results'] ?? null;
        if (!is_array($rows) || empty($rows)) {
            $result->setValidationMessages(['results' => ['At least one result is required.']]);
            return $result;
        }

        $seq = QueryUtils::fetchSingleValue(
            "SELECT MIN(procedure_order_seq) FROM procedure_order_code WHERE procedure_order_id = ?",
            'MIN(procedure_order_seq)',
            [$orderId]
        );
        $seq = $seq === null ? 1 : (int)$seq;

        $reportStatus = !empty($data['report_status']) ? (string)$data['report_status'] : 'final';
        $reviewStatus = !empty($data['review_status']) ? (string)$data['review_status'] : 'received';
        $dateReport = !empty($data['date_report']) ? (string)$data['date_report'] : date('Y-m-d H:i:s');
        $specimenNum = (string)($data['specimen_num'] ?? '');

        try {
            $inserted = QueryUtils::inTransaction(function () use (
                $orderId,
                $seq,
                $reportStatus,
                $reviewStatus,
                $dateReport,
                $specimenNum,
                $rows
            ) {
                $reportId = QueryUtils::sqlInsert(
                    "INSERT INTO procedure_report "
                    . "(procedure_order_id, procedure_order_seq, date_report, specimen_num, "
                    . "report_status, review_status) VALUES (?, ?, ?, ?, ?, ?)",
                    [$orderId, $seq, $dateReport, $specimenNum, $reportStatus, $reviewStatus]
                );
                UuidRegistry::createMissingUuidForRow('procedure_report', 'procedure_report_id', $reportId);

                $created = [];
                foreach ($rows as $row) {
                    $code = trim((string)($row['result_code'] ?? ''));
                    if ($code === '') {
                        continue;
                    }
                    $resultId = QueryUtils::sqlInsert(
                        "INSERT INTO procedure_result "
                        . "(procedure_report_id, result_data_type, result_code, result_text, result, "
                        . "units, `range`, abnormal, result_status, date, comments) "
                        . "VALUES (?, 'S', ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                        [
                            $reportId,
                            $code,
                            (string)($row['result_text'] ?? $code),
                            (string)($row['result'] ?? ''),
                            (string)($row['units'] ?? ''),
                            (string)($row['range'] ?? ''),
                            (string)($row['abnormal'] ?? ''),
                            (string)($row['result_status'] ?? $reportStatus),
                            !empty($row['date']) ? (string)$row['date'] : $dateReport,
                            (string)($row['comments'] ?? ''),
                        ]
                    );
                    UuidRegistry::createMissingUuidForRow('procedure_result', 'procedure_result_id', $resultId);
                    $resultUuid = QueryUtils::fetchSingleValue(
                        "SELECT uuid FROM procedure_result WHERE procedure_result_id = ?",
                        'uuid',
                        [$resultId]
                    );
                    $created[] = [
                        'result_id' => $resultId,
                        'result_uuid' => $this->uuidToString($resultUuid),
                        'result_code' => $code,
                    ];
                }

                QueryUtils::sqlStatementThrowException(
                    "UPDATE procedure_order SET order_status = 'complete' WHERE procedure_order_id = ?",
                    [$orderId]
                );

                return ['report_id' => $reportId, 'results' => $created];
            });
        } catch (\Throwable $e) {
            $result->addInternalError('Failed to record lab result: ' . $e->getMessage());
            return $result;
        }

        $orderContext = QueryUtils::fetchRecords(
            "SELECT p.uuid AS patient_uuid, u.uuid AS provider_uuid "
            . "FROM procedure_order po "
            . "JOIN patient_data p ON p.pid = po.patient_id "
            . "LEFT JOIN users u ON u.id = po.provider_id "
            . "WHERE po.procedure_order_id = ?",
            [$orderId]
        );
        $ctx = $orderContext[0] ?? [];

        $result->addData($inserted + [
            'order_id' => $orderId,
            'patient_uuid' => $this->uuidToString($ctx['patient_uuid'] ?? null),
            'provider_uuid' => $this->uuidToString($ctx['provider_uuid'] ?? null),
        ]);

        return $result;
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

    private function resolveProviderId(array $data): int
    {
        $id = $data['provider_id'] ?? null;
        if ($id !== null && $id !== '') {
            return (int)$id;
        }
        $uuid = $data['provider_uuid'] ?? null;
        if ($uuid !== null && $uuid !== '') {
            $found = QueryUtils::fetchSingleValue(
                "SELECT id FROM users WHERE uuid = ?",
                'id',
                [UuidRegistry::uuidToBytes((string)$uuid)]
            );
            return $found === null ? 0 : (int)$found;
        }
        return 0;
    }

    private function resolveLabId(array $data): int
    {
        $id = $data['lab_id'] ?? null;
        if ($id !== null && $id !== '') {
            return (int)$id;
        }
        $uuid = $data['lab_uuid'] ?? null;
        if ($uuid !== null && $uuid !== '') {
            $found = QueryUtils::fetchSingleValue(
                "SELECT ppid FROM procedure_providers WHERE uuid = ?",
                'ppid',
                [UuidRegistry::uuidToBytes((string)$uuid)]
            );
            return $found === null ? 0 : (int)$found;
        }
        return 0;
    }

    private function resolveOrderId(array $data): int
    {
        $id = $data['order_id'] ?? null;
        if ($id !== null && $id !== '') {
            return (int)$id;
        }
        $uuid = $data['order_uuid'] ?? null;
        if ($uuid !== null && $uuid !== '') {
            $found = QueryUtils::fetchSingleValue(
                "SELECT procedure_order_id FROM procedure_order WHERE uuid = ?",
                'procedure_order_id',
                [UuidRegistry::uuidToBytes((string)$uuid)]
            );
            return $found === null ? 0 : (int)$found;
        }
        return 0;
    }

    private function resolveResultId(array $data): int
    {
        $id = $data['result_id'] ?? null;
        if ($id !== null && $id !== '') {
            return (int)$id;
        }
        $uuid = $data['result_uuid'] ?? null;
        if ($uuid !== null && $uuid !== '') {
            $found = QueryUtils::fetchSingleValue(
                "SELECT procedure_result_id FROM procedure_result WHERE uuid = ?",
                'procedure_result_id',
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
