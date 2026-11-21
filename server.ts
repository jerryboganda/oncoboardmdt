import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  createSession,
  hashPassword,
  requireAuth,
  revokeSession,
  verifyPassword,
  type AuthenticatedRequest,
} from './server/auth';
import {
  db,
  mapAnnotationRow,
  mapAuditRow,
  mapCaseRow,
  mapClinicianRow,
  mapMeetingRow,
  mapMessageRow,
  mapVoteRow,
} from './server/db';
import {
  analyzeDicomSliceSnapshot,
  answerCaseQuestion,
  draftConsensusMinutes,
  synthesizeCaseClinicalSupport,
} from './server/ai';
import { boardHub } from './server/ws';
import { deriveStageGroup } from './src/lib/clinicalRules';
import type {
  CaseStatus,
  CaseUrgency,
  ConsensusPlan,
  DicomPresetKey,
  OrganBoard,
  SpecialtyRole,
} from './src/types';

const VALID_BOARDS = new Set<OrganBoard>(['Thoracic', 'Neuro', 'Breast', 'GI', 'Heme']);
const VALID_URGENCIES = new Set<CaseUrgency>(['Routine', 'Priority', 'Urgent']);
const VALID_STATUSES = new Set<CaseStatus>(['Intake', 'Scheduled', 'In Review', 'Consensus Reached']);
const VALID_ROLES = new Set<SpecialtyRole>([
  'Medical Oncology',
  'Surgical Oncology',
  'Radiation Oncology',
  'Diagnostic Radiology',
  'Molecular Pathology',
  'MDT Coordinator',
]);

function mapBoardToPreset(board: OrganBoard): DicomPresetKey {
  switch (board) {
    case 'Neuro':
      return 'neuro_mri';
    case 'Breast':
      return 'breast_mri';
    case 'GI':
      return 'gi_liver_ct';
    case 'Heme':
      return 'heme_pet_ct';
    default:
      return 'thoracic_ct';
  }
}

async function logAudit(
  actor: { id: string; fullName: string; specialty: SpecialtyRole },
  action: string,
  resourceType: string,
  resourceId: string,
  detail: string,
): Promise<void> {
  await db.execute(
    `INSERT INTO audit_logs (
      id, actor_id, actor_name, actor_specialty, action, resource_type, resource_id, detail, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      `aud-${crypto.randomUUID().slice(0, 8)}`,
      actor.id,
      actor.fullName,
      actor.specialty,
      action,
      resourceType,
      resourceId,
      detail,
      new Date().toISOString(),
    ],
  );
}

async function bootstrap(): Promise<void> {
  await db.init();

  const app = express();
  app.use(express.json({ limit: '10mb' }));

  // --- Health & Hostinger MySQL / SQLite System Status ---
  app.get('/api/system/status', async (_req, res) => {
    try {
      const info = await db.getSystemInfo();
      res.json({
        ...info,
        aiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Status check failed' });
    }
  });

  // --- Clinician Auth Routes ---
  app.get('/api/auth/clinicians', async (_req, res) => {
    try {
      const rows = await db.query('SELECT * FROM clinicians ORDER BY is_chair DESC, full_name ASC');
      res.json({ clinicians: rows.map(mapClinicianRow) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load clinicians' });
    }
  });

  app.post('/api/auth/login', async (req, res) => {
    try {
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      if (!email || !password) {
        res.status(400).json({ error: 'Email and password are required.' });
        return;
      }

      const row = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM clinicians WHERE LOWER(email) = ?',
        [email],
      );
      if (!row || !verifyPassword(password, String(row.password_hash))) {
        res.status(401).json({ error: 'Invalid clinician email or password.' });
        return;
      }

      const clinician = mapClinicianRow(row);
      const session = createSession(clinician);
      res.json({ token: session.token, clinician });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Login failed' });
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const fullName = String(req.body?.fullName ?? '').trim();
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      const specialty = String(req.body?.specialty ?? '') as SpecialtyRole;
      const title = String(req.body?.title ?? 'Attending Specialist').trim();

      if (!fullName || !email || password.length < 8 || !VALID_ROLES.has(specialty)) {
        res.status(400).json({
          error: 'Full name, valid email, specialty role, and password (min 8 chars) are required.',
        });
        return;
      }

      const existing = await db.queryOne('SELECT id FROM clinicians WHERE LOWER(email) = ?', [email]);
      if (existing) {
        res.status(409).json({ error: 'A clinician account with that email already exists.' });
        return;
      }

      const id = `clin-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO clinicians (id, full_name, email, password_hash, specialty, title, institution, is_chair, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          fullName,
          email,
          hashPassword(password),
          specialty,
          title,
          'Regional Comprehensive Cancer Center',
          0,
          now,
        ],
      );

      const createdRow = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM clinicians WHERE id = ?',
        [id],
      );
      const clinician = mapClinicianRow(createdRow!);
      const session = createSession(clinician);
      await logAudit(clinician, 'CLINICIAN_REGISTERED', 'clinician', clinician.id, `Registered ${clinician.specialty} account.`);
      res.status(201).json({ token: session.token, clinician });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Registration failed' });
    }
  });

  app.post('/api/auth/demo-session', async (req, res) => {
    try {
      const clinicianId = String(req.body?.clinicianId ?? 'clin-med-01').trim();
      const row = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM clinicians WHERE id = ?',
        [clinicianId],
      );
      if (!row) {
        res.status(404).json({ error: 'Requested clinician profile not found.' });
        return;
      }
      const clinician = mapClinicianRow(row);
      const session = createSession(clinician);
      res.json({ token: session.token, clinician });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Session creation failed' });
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ clinician: req.clinician });
  });

  app.post('/api/auth/logout', requireAuth, (req: AuthenticatedRequest, res) => {
    revokeSession(req.sessionToken);
    res.json({ ok: true });
  });

  // --- Patient Cases CRUD ---
  app.get('/api/cases', async (_req, res) => {
    try {
      const rows = await db.query('SELECT * FROM patient_cases ORDER BY updated_at DESC');
      res.json({ cases: rows.map(mapCaseRow) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load cases' });
    }
  });

  app.get('/api/cases/:id', async (req, res) => {
    try {
      const row = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM patient_cases WHERE id = ?',
        [req.params.id],
      );
      if (!row) {
        res.status(404).json({ error: 'Patient case not found.' });
        return;
      }
      const annotations = await db.query(
        'SELECT * FROM imaging_annotations WHERE case_id = ? ORDER BY created_at DESC',
        [req.params.id],
      );
      const votes = await db.query(
        'SELECT * FROM consensus_votes WHERE case_id = ? ORDER BY created_at DESC',
        [req.params.id],
      );
      res.json({
        patientCase: mapCaseRow(row),
        annotations: annotations.map(mapAnnotationRow),
        votes: votes.map(mapVoteRow),
      });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load case' });
    }
  });

  app.post('/api/cases', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const mrn = String(req.body?.mrn ?? '').trim().toUpperCase();
      const patientInitials = String(req.body?.patientInitials ?? '').trim().toUpperCase();
      const age = Number(req.body?.age);
      const sex = String(req.body?.sex ?? 'Female');
      const organBoard = String(req.body?.organBoard ?? 'Thoracic') as OrganBoard;
      const primaryDiagnosis = String(req.body?.primaryDiagnosis ?? '').trim();
      const histology = String(req.body?.histology ?? 'Pending final pathology review').trim();
      const tnmT = String(req.body?.tnmT ?? 'T2').trim();
      const tnmN = String(req.body?.tnmN ?? 'N0').trim();
      const tnmM = String(req.body?.tnmM ?? 'M0').trim();
      const ecog = Number(req.body?.ecog ?? 1);
      const urgency = String(req.body?.urgency ?? 'Priority') as CaseUrgency;
      const clinicalSummary = String(req.body?.clinicalSummary ?? '').trim();
      const baselineSumMm = Number(req.body?.baselineSumMm ?? 35);

      if (!mrn || !patientInitials || !primaryDiagnosis || !clinicalSummary) {
        res.status(400).json({
          error: 'MRN, patient initials, primary diagnosis, and clinical summary are required.',
        });
        return;
      }
      if (!Number.isFinite(age) || age < 1 || age > 120) {
        res.status(400).json({ error: 'Age must be between 1 and 120.' });
        return;
      }
      if (!VALID_BOARDS.has(organBoard) || !VALID_URGENCIES.has(urgency)) {
        res.status(400).json({ error: 'Invalid organ board or urgency classification.' });
        return;
      }

      const dup = await db.queryOne('SELECT id FROM patient_cases WHERE mrn = ?', [mrn]);
      if (dup) {
        res.status(409).json({ error: `A patient case with MRN "${mrn}" already exists.` });
        return;
      }

      const id = `case-${organBoard.toLowerCase()}-${crypto.randomUUID().slice(0, 6)}`;
      const stageGroup =
        String(req.body?.stageGroup ?? '').trim() || deriveStageGroup(tnmT, tnmN, tnmM);
      const now = new Date().toISOString();

      const pathology = {
        specimenId: `SP-26-${Math.floor(10000 + Math.random() * 89999)}`,
        biopsyDate: now.slice(0, 10),
        biopsySite: `${organBoard} Primary Site`,
        histology,
        grade: 'Pending formal grading',
        margins: 'Biopsy specimen',
        ihcMarkers: [],
        pathologistNote: 'Intake specimen registered for multidisciplinary pathology review.',
      };

      const genomics = {
        assayName: 'Comprehensive Solid/Heme NGS Panel',
        tmbMutPerMb: 5.0,
        msiStatus: 'MSS',
        pdL1Score: 'Pending',
        mutations: [],
        trialMatches: [],
      };

      await db.execute(
        `INSERT INTO patient_cases (
          id, mrn, patient_initials, age, sex, organ_board, primary_diagnosis, histology,
          tnm_t, tnm_n, tnm_m, stage_group, ecog, urgency, status, lead_clinician_id,
          clinical_summary, treatment_history_json, labs_json, pathology_json, genomics_json,
          dicom_preset, baseline_sum_mm, consensus_json, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          mrn,
          patientInitials,
          age,
          sex,
          organBoard,
          primaryDiagnosis,
          histology,
          tnmT,
          tnmN,
          tnmM,
          stageGroup,
          Math.max(0, Math.min(4, ecog)),
          urgency,
          'Intake',
          req.clinician!.id,
          clinicalSummary,
          JSON.stringify([]),
          JSON.stringify([]),
          JSON.stringify(pathology),
          JSON.stringify(genomics),
          mapBoardToPreset(organBoard),
          Number.isFinite(baselineSumMm) ? baselineSumMm : 35,
          null,
          now,
          now,
        ],
      );

      await logAudit(
        req.clinician!,
        'CASE_CREATED',
        'patient_case',
        id,
        `Registered ${organBoard} case ${mrn}: ${primaryDiagnosis} (${stageGroup}).`,
      );

      const created = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM patient_cases WHERE id = ?',
        [id],
      );
      res.status(201).json({ patientCase: mapCaseRow(created!) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to create case' });
    }
  });

  app.patch('/api/cases/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const existing = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM patient_cases WHERE id = ?',
        [req.params.id],
      );
      if (!existing) {
        res.status(404).json({ error: 'Patient case not found.' });
        return;
      }

      const current = mapCaseRow(existing);
      const tnmT = req.body?.tnmT !== undefined ? String(req.body.tnmT).trim() : current.tnmT;
      const tnmN = req.body?.tnmN !== undefined ? String(req.body.tnmN).trim() : current.tnmN;
      const tnmM = req.body?.tnmM !== undefined ? String(req.body.tnmM).trim() : current.tnmM;
      const stageGroup =
        req.body?.stageGroup !== undefined
          ? String(req.body.stageGroup).trim()
          : current.stageGroup;
      const status =
        req.body?.status && VALID_STATUSES.has(req.body.status) ? req.body.status : current.status;
      const urgency =
        req.body?.urgency && VALID_URGENCIES.has(req.body.urgency)
          ? req.body.urgency
          : current.urgency;
      const ecog = req.body?.ecog !== undefined ? Number(req.body.ecog) : current.ecog;
      const clinicalSummary =
        req.body?.clinicalSummary !== undefined
          ? String(req.body.clinicalSummary).trim()
          : current.clinicalSummary;
      const pathology = req.body?.pathology ?? current.pathology;
      const genomics = req.body?.genomics ?? current.genomics;
      const now = new Date().toISOString();

      await db.execute(
        `UPDATE patient_cases
         SET tnm_t = ?, tnm_n = ?, tnm_m = ?, stage_group = ?, status = ?, urgency = ?,
             ecog = ?, clinical_summary = ?, pathology_json = ?, genomics_json = ?, updated_at = ?
         WHERE id = ?`,
        [
          tnmT,
          tnmN,
          tnmM,
          stageGroup,
          status,
          urgency,
          ecog,
          clinicalSummary,
          JSON.stringify(pathology),
          JSON.stringify(genomics),
          now,
          req.params.id,
        ],
      );

      await logAudit(
        req.clinician!,
        'CASE_UPDATED',
        'patient_case',
        req.params.id,
        `Updated clinical staging/status on ${current.mrn} (${tnmT} ${tnmN} ${tnmM}, ${status}).`,
      );

      const updated = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM patient_cases WHERE id = ?',
        [req.params.id],
      );
      res.json({ patientCase: mapCaseRow(updated!) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update case' });
    }
  });

  // --- Imaging RECIST Annotations ---
  app.get('/api/cases/:id/annotations', async (req, res) => {
    try {
      const rows = await db.query(
        'SELECT * FROM imaging_annotations WHERE case_id = ? ORDER BY created_at DESC',
        [req.params.id],
      );
      res.json({ annotations: rows.map(mapAnnotationRow) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load annotations' });
    }
  });

  app.post('/api/cases/:id/annotations', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const caseId = req.params.id;
      const label = String(req.body?.label ?? '').trim();
      const seriesId = String(req.body?.seriesId ?? 'SER-01').trim();
      const sliceIndex = Number(req.body?.sliceIndex ?? 0);
      const lesionType = String(req.body?.lesionType ?? 'Target (RECIST)');
      const x1 = Number(req.body?.x1);
      const y1 = Number(req.body?.y1);
      const x2 = Number(req.body?.x2);
      const y2 = Number(req.body?.y2);
      const lengthMm = Number(req.body?.lengthMm);
      const meanHu = req.body?.meanHu !== null && req.body?.meanHu !== undefined ? Number(req.body.meanHu) : null;

      if (!label || !Number.isFinite(lengthMm) || lengthMm < 0) {
        res.status(400).json({ error: 'Valid lesion label and calibrated millimeter length are required.' });
        return;
      }

      const id = `annot-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO imaging_annotations (
          id, case_id, series_id, slice_index, label, lesion_type,
          x1, y1, x2, y2, length_mm, mean_hu, author_name, author_specialty, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          caseId,
          seriesId,
          sliceIndex,
          label,
          lesionType,
          x1,
          y1,
          x2,
          y2,
          lengthMm,
          meanHu,
          req.clinician!.fullName,
          req.clinician!.specialty,
          now,
        ],
      );

      const createdRow = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM imaging_annotations WHERE id = ?',
        [id],
      );
      const annotation = mapAnnotationRow(createdRow!);

      await logAudit(
        req.clinician!,
        'ANNOTATION_SAVED',
        'imaging_annotation',
        id,
        `Saved ${lesionType} "${label}" (${lengthMm} mm, Slice ${sliceIndex + 1}) on case ${caseId}.`,
      );

      boardHub.broadcast(`case:${caseId}`, { type: 'annotation:saved', payload: annotation });
      res.status(201).json({ annotation });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to save annotation' });
    }
  });

  app.delete('/api/annotations/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await db.execute('DELETE FROM imaging_annotations WHERE id = ?', [req.params.id]);
      await logAudit(
        req.clinician!,
        'ANNOTATION_DELETED',
        'imaging_annotation',
        req.params.id,
        `Removed imaging measurement ${req.params.id}.`,
      );
      res.json({ ok: true });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to delete annotation' });
    }
  });

  // --- Tumour Board Meetings & Scheduler ---
  app.get('/api/meetings', async (_req, res) => {
    try {
      const rows = await db.query('SELECT * FROM mdt_meetings ORDER BY scheduled_start ASC');
      res.json({ meetings: rows.map(mapMeetingRow) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load meetings' });
    }
  });

  app.post('/api/meetings', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const title = String(req.body?.title ?? '').trim();
      const organBoard = String(req.body?.organBoard ?? 'Multi-Organ');
      const scheduledStart = String(req.body?.scheduledStart ?? '').trim();
      const durationMinutes = Number(req.body?.durationMinutes ?? 60);
      const agendaCaseIds: string[] = Array.isArray(req.body?.caseIds) ? req.body.caseIds : [];

      if (!title || !scheduledStart) {
        res.status(400).json({ error: 'Meeting title and scheduled start time are required.' });
        return;
      }

      const id = `mtg-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      const agenda = agendaCaseIds.map((caseId) => ({
        caseId: String(caseId),
        presenterName: req.clinician!.fullName,
        presenterSpecialty: req.clinician!.specialty,
        allocatedMinutes: 15,
        completed: false,
      }));

      await db.execute(
        `INSERT INTO mdt_meetings (
          id, title, organ_board, scheduled_start, duration_minutes,
          chair_name, room_status, agenda_json, active_case_id, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          title,
          organBoard,
          scheduledStart,
          Math.max(15, Math.min(240, durationMinutes)),
          req.clinician!.fullName,
          'Scheduled',
          JSON.stringify(agenda),
          agenda[0]?.caseId ?? null,
          now,
        ],
      );

      await logAudit(
        req.clinician!,
        'MEETING_SCHEDULED',
        'mdt_meeting',
        id,
        `Scheduled "${title}" (${organBoard}) with ${agenda.length} agenda case(s).`,
      );

      const created = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM mdt_meetings WHERE id = ?',
        [id],
      );
      res.status(201).json({ meeting: mapMeetingRow(created!) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to schedule meeting' });
    }
  });

  app.patch('/api/meetings/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const existing = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM mdt_meetings WHERE id = ?',
        [req.params.id],
      );
      if (!existing) {
        res.status(404).json({ error: 'Meeting not found.' });
        return;
      }
      const current = mapMeetingRow(existing);
      const roomStatus = req.body?.roomStatus ?? current.roomStatus;
      const activeCaseId =
        req.body?.activeCaseId !== undefined ? req.body.activeCaseId : current.activeCaseId;
      const agenda = Array.isArray(req.body?.agenda) ? req.body.agenda : current.agenda;

      await db.execute(
        'UPDATE mdt_meetings SET room_status = ?, active_case_id = ?, agenda_json = ? WHERE id = ?',
        [roomStatus, activeCaseId, JSON.stringify(agenda), req.params.id],
      );

      const updatedRow = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM mdt_meetings WHERE id = ?',
        [req.params.id],
      );
      const meeting = mapMeetingRow(updatedRow!);
      boardHub.broadcast(`meeting:${meeting.id}`, { type: 'meeting:updated', payload: meeting });
      res.json({ meeting });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to update meeting' });
    }
  });

  // --- Consensus Votes & Sign-Off ---
  app.get('/api/cases/:id/votes', async (req, res) => {
    try {
      const rows = await db.query(
        'SELECT * FROM consensus_votes WHERE case_id = ? ORDER BY created_at DESC',
        [req.params.id],
      );
      res.json({ votes: rows.map(mapVoteRow) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load votes' });
    }
  });

  app.post('/api/cases/:id/votes', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const caseId = req.params.id;
      const optionLabel = String(req.body?.optionLabel ?? '').trim();
      const rationale = String(req.body?.rationale ?? '').trim();
      const meetingId = req.body?.meetingId ? String(req.body.meetingId) : null;

      if (!optionLabel) {
        res.status(400).json({ error: 'Please choose a treatment pathway option before submitting your vote.' });
        return;
      }

      const existing = await db.queryOne<{ id: string }>(
        'SELECT id FROM consensus_votes WHERE case_id = ? AND clinician_id = ?',
        [caseId, req.clinician!.id],
      );

      const now = new Date().toISOString();
      if (existing) {
        await db.execute(
          `UPDATE consensus_votes
           SET option_label = ?, rationale = ?, meeting_id = ?, created_at = ?
           WHERE id = ?`,
          [optionLabel, rationale || 'Concurs with multidisciplinary pathway.', meetingId, now, existing.id],
        );
      } else {
        const id = `vote-${crypto.randomUUID().slice(0, 8)}`;
        await db.execute(
          `INSERT INTO consensus_votes (
            id, case_id, meeting_id, clinician_id, clinician_name, specialty, option_label, rationale, created_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id,
            caseId,
            meetingId,
            req.clinician!.id,
            req.clinician!.fullName,
            req.clinician!.specialty,
            optionLabel,
            rationale || 'Concurs with multidisciplinary pathway.',
            now,
          ],
        );
      }

      const allVotesRows = await db.query(
        'SELECT * FROM consensus_votes WHERE case_id = ? ORDER BY created_at DESC',
        [caseId],
      );
      const votes = allVotesRows.map(mapVoteRow);

      await logAudit(
        req.clinician!,
        'VOTE_CAST',
        'patient_case',
        caseId,
        `Cast ${req.clinician!.specialty} consensus vote: "${optionLabel}".`,
      );

      if (meetingId) {
        boardHub.broadcast(`meeting:${meetingId}`, {
          type: 'vote:updated',
          payload: { caseId, votes },
        });
      }
      boardHub.broadcast(`case:${caseId}`, { type: 'vote:updated', payload: { caseId, votes } });

      res.json({ votes });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to cast vote' });
    }
  });

  app.post('/api/cases/:id/consensus', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const caseId = req.params.id;
      const primaryRecommendation = String(req.body?.primaryRecommendation ?? '').trim();
      const stagingConfirmed = String(req.body?.stagingConfirmed ?? '').trim();
      const clinicalRationale = String(req.body?.clinicalRationale ?? '').trim();
      const clinicalTrialRecommended = String(
        req.body?.clinicalTrialRecommended ?? 'Standard of care pathway',
      ).trim();
      const followUpActions = Array.isArray(req.body?.followUpActions)
        ? req.body.followUpActions
        : [];
      const meetingId = req.body?.meetingId ? String(req.body.meetingId) : null;

      if (!primaryRecommendation || !clinicalRationale) {
        res.status(400).json({
          error: 'Primary recommendation and clinical rationale are required for consensus sign-off.',
        });
        return;
      }

      const now = new Date().toISOString();
      const consensus: ConsensusPlan = {
        primaryRecommendation,
        stagingConfirmed: stagingConfirmed || 'Confirmed per AJCC review',
        clinicalRationale,
        clinicalTrialRecommended,
        followUpActions,
        signedOffBy: req.clinician!.fullName,
        signedOffSpecialty: req.clinician!.specialty,
        signedOffAt: now,
      };

      await db.execute(
        'UPDATE patient_cases SET consensus_json = ?, status = ?, updated_at = ? WHERE id = ?',
        [JSON.stringify(consensus), 'Consensus Reached', now, caseId],
      );

      await logAudit(
        req.clinician!,
        'CONSENSUS_SIGNED',
        'patient_case',
        caseId,
        `Signed final MDT consensus recommendation: ${primaryRecommendation.slice(0, 120)}`,
      );

      const updatedRow = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM patient_cases WHERE id = ?',
        [caseId],
      );
      const patientCase = mapCaseRow(updatedRow!);

      if (meetingId) {
        boardHub.broadcast(`meeting:${meetingId}`, {
          type: 'consensus:signed',
          payload: { caseId, patientCase },
        });
      }
      boardHub.broadcast(`case:${caseId}`, {
        type: 'consensus:signed',
        payload: { caseId, patientCase },
      });

      res.json({ patientCase });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to sign consensus' });
    }
  });

  // --- Secure Case & Board Room Messaging ---
  app.get('/api/messages', async (req, res) => {
    try {
      const roomId = String(req.query.roomId ?? '').trim();
      if (!roomId) {
        res.status(400).json({ error: 'roomId query parameter is required.' });
        return;
      }
      const rows = await db.query(
        'SELECT * FROM case_messages WHERE room_id = ? ORDER BY created_at ASC',
        [roomId],
      );
      res.json({ messages: rows.map(mapMessageRow) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load messages' });
    }
  });

  app.post('/api/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const roomId = String(req.body?.roomId ?? '').trim();
      const caseId = req.body?.caseId ? String(req.body.caseId) : null;
      const tag = String(req.body?.tag ?? 'General').trim();
      const body = String(req.body?.body ?? '').trim();

      if (!roomId || !body) {
        res.status(400).json({ error: 'Message room and content are required.' });
        return;
      }

      const id = `msg-${crypto.randomUUID().slice(0, 8)}`;
      const now = new Date().toISOString();
      await db.execute(
        `INSERT INTO case_messages (
          id, room_id, case_id, sender_id, sender_name, sender_specialty, tag, body, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id,
          roomId,
          caseId,
          req.clinician!.id,
          req.clinician!.fullName,
          req.clinician!.specialty,
          tag,
          body,
          now,
        ],
      );

      const createdRow = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM case_messages WHERE id = ?',
        [id],
      );
      const message = mapMessageRow(createdRow!);
      boardHub.broadcast(roomId, { type: 'chat:new', payload: message });
      res.status(201).json({ message });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to send message' });
    }
  });

  // --- Audit Trail ---
  app.get('/api/audit', async (_req, res) => {
    try {
      const rows = await db.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 80');
      res.json({ logs: rows.map(mapAuditRow) });
    } catch (err) {
      res.status(500).json({ error: err instanceof Error ? err.message : 'Failed to load audit log' });
    }
  });

  // --- Server-Side Gemini AI Diagnostic Decision Support Routes ---
  app.post('/api/ai/synthesize', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const caseId = String(req.body?.caseId ?? '').trim();
      const caseRow = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM patient_cases WHERE id = ?',
        [caseId],
      );
      if (!caseRow) {
        res.status(404).json({ error: 'Patient case not found.' });
        return;
      }
      const annotations = (
        await db.query('SELECT * FROM imaging_annotations WHERE case_id = ?', [caseId])
      ).map(mapAnnotationRow);

      const patientCase = mapCaseRow(caseRow);
      const result = await synthesizeCaseClinicalSupport(patientCase, annotations);

      await logAudit(
        req.clinician!,
        'AI_GUIDELINE_SYNTHESIS',
        'patient_case',
        caseId,
        `Generated AI guideline concordance review for ${patientCase.mrn}.`,
      );
      res.json({ synthesis: result });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'AI clinical synthesis request failed.',
      });
    }
  });

  app.post('/api/ai/dicom-assist', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const caseId = String(req.body?.caseId ?? '').trim();
      const snapshotBase64 = String(req.body?.snapshotBase64 ?? '').trim();
      const sliceMeta = req.body?.sliceMeta;

      if (!caseId || !snapshotBase64 || !sliceMeta) {
        res.status(400).json({ error: 'Case ID, DICOM canvas snapshot, and slice metadata are required.' });
        return;
      }

      const caseRow = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM patient_cases WHERE id = ?',
        [caseId],
      );
      if (!caseRow) {
        res.status(404).json({ error: 'Patient case not found.' });
        return;
      }

      const patientCase = mapCaseRow(caseRow);
      const impression = await analyzeDicomSliceSnapshot(patientCase, snapshotBase64, sliceMeta);

      await logAudit(
        req.clinician!,
        'AI_DICOM_IMPRESSION',
        'patient_case',
        caseId,
        `Ran multimodal AI radiology assist on Slice ${Number(sliceMeta.sliceIndex) + 1} for ${patientCase.mrn}.`,
      );
      res.json({ impression });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'AI DICOM impression request failed.',
      });
    }
  });

  app.post('/api/ai/minutes', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const caseId = String(req.body?.caseId ?? '').trim();
      const roomId = String(req.body?.roomId ?? `case:${caseId}`).trim();
      const caseRow = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM patient_cases WHERE id = ?',
        [caseId],
      );
      if (!caseRow) {
        res.status(404).json({ error: 'Patient case not found.' });
        return;
      }

      const votes = (
        await db.query('SELECT * FROM consensus_votes WHERE case_id = ?', [caseId])
      ).map(mapVoteRow);
      const messages = (
        await db.query('SELECT * FROM case_messages WHERE room_id = ? OR case_id = ? ORDER BY created_at ASC', [
          roomId,
          caseId,
        ])
      ).map(mapMessageRow);

      const patientCase = mapCaseRow(caseRow);
      const minutes = await draftConsensusMinutes(patientCase, votes, messages);

      await logAudit(
        req.clinician!,
        'AI_MINUTES_DRAFTED',
        'patient_case',
        caseId,
        `Drafted MDT consensus minutes for ${patientCase.mrn}.`,
      );
      res.json({ minutes });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'AI consensus minutes drafting failed.',
      });
    }
  });

  app.post('/api/ai/chat', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const caseId = String(req.body?.caseId ?? '').trim();
      const question = String(req.body?.question ?? '').trim();
      const history = Array.isArray(req.body?.history) ? req.body.history : [];

      if (!caseId || !question) {
        res.status(400).json({ error: 'Case ID and clinician question are required.' });
        return;
      }

      const caseRow = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM patient_cases WHERE id = ?',
        [caseId],
      );
      if (!caseRow) {
        res.status(404).json({ error: 'Patient case not found.' });
        return;
      }

      const annotations = (
        await db.query('SELECT * FROM imaging_annotations WHERE case_id = ?', [caseId])
      ).map(mapAnnotationRow);
      const answer = await answerCaseQuestion(mapCaseRow(caseRow), annotations, question, history);
      res.json({ answer });
    } catch (err) {
      res.status(502).json({
        error: err instanceof Error ? err.message : 'AI copilot response failed.',
      });
    }
  });

  // --- Mount Vite Dev Middleware or Production Static Bundle ---
  const server = http.createServer(app);
  boardHub.attach(server);

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`[OncoBoard MDT] Server listening on http://0.0.0.0:${port} (SQL Engine: ${db.engine.toUpperCase()})`);
  });
}

bootstrap().catch((err) => {
  console.error('[OncoBoard MDT] Fatal startup error:', err);
  process.exit(1);
});
