import 'dotenv/config';
import crypto from 'node:crypto';
import http from 'node:http';
import path from 'node:path';
import dicomParser from 'dicom-parser';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import {
  clearFailures,
  createSession,
  hashPassword,
  isLocked,
  purgeExpiredSessions,
  recordFailure,
  requireAuth,
  revokeAllSessions,
  revokeOtherSessions,
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
  mapDicomRow,
  mapMeetingRow,
  mapMessageRow,
  mapVoteRow,
  SEED_DEMO_PASSWORD,
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

const VALID_SEX = new Set(['Female', 'Male', 'Other']);
const VALID_ROOM_STATUSES = new Set(['Scheduled', 'Live', 'Completed']);
const VALID_MESSAGE_TAGS = new Set([
  'General',
  'Radiology Finding',
  'Pathology Update',
  'Action Item',
  'Urgent Handoff',
]);

const isPlainObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

// Full error text (which can include SQL) goes to the server log; production clients get the generic line.
function fail(res: express.Response, err: unknown, fallback: string): void {
  console.error(`[api] ${fallback}`, err);
  const detail = err instanceof Error ? err.message : fallback;
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? fallback : detail });
}

// Writes against a missing or archived case would otherwise create orphan rows.
async function caseExists(id: string): Promise<boolean> {
  return Boolean(await db.queryOne('SELECT id FROM patient_cases WHERE id = ? AND archived_at IS NULL', [id]));
}

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

// Demo mode (auto sign-in, clinician switching, seeded password) is on for local dev and
// off in production unless DEMO_MODE=true is set in the hosting panel.
const DEMO_MODE = process.env.DEMO_MODE === 'true' || process.env.NODE_ENV !== 'production';
const REGISTRATION_CODE = process.env.REGISTRATION_CODE?.trim() ?? '';

function codeMatches(given: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(REGISTRATION_CODE);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
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
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    if (process.env.NODE_ENV === 'production') {
      res.setHeader('Strict-Transport-Security', 'max-age=15552000');
    }
    next();
  });
  // Clinical data must never be cached by a browser or intermediary.
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  // Only the DICOM snapshot route needs a large body; everything else is capped at 1 MB.
  app.use('/api/ai/dicom-assist', express.json({ limit: '10mb' }));
  app.use(express.json({ limit: '1mb' }));

  // Public liveness probe for the host / uptime monitors. It reveals nothing beyond up or down.
  app.get('/api/health', async (_req, res) => {
    try {
      await db.queryOne('SELECT 1 AS ok');
      res.json({ ok: true });
    } catch (err) {
      console.error('[api] Health check failed', err);
      res.status(503).json({ ok: false });
    }
  });

  // --- Health & Hostinger MySQL / SQLite System Status ---
  app.get('/api/system/status', requireAuth, async (_req, res) => {
    try {
      const info = await db.getSystemInfo();
      res.json({
        ...info,
        aiConfigured: Boolean(process.env.GEMINI_API_KEY?.trim()),
      });
    } catch (err) {
      fail(res, err, 'Status check failed');
    }
  });

  // --- Clinician Auth Routes ---
  // Public: tells the sign-in screen which options this server allows.
  app.get('/api/auth/config', (_req, res) => {
    res.json({ demoMode: DEMO_MODE, registrationOpen: DEMO_MODE || REGISTRATION_CODE.length > 0 });
  });

  app.get('/api/auth/clinicians', requireAuth, async (_req, res) => {
    try {
      const rows = await db.query('SELECT * FROM clinicians ORDER BY is_chair DESC, full_name ASC');
      res.json({ clinicians: rows.map(mapClinicianRow) });
    } catch (err) {
      fail(res, err, 'Failed to load clinicians');
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
      if (!DEMO_MODE && password === SEED_DEMO_PASSWORD) {
        res.status(401).json({ error: 'The shared demo password is disabled on this server. Ask your administrator to reset your account.' });
        return;
      }

      const lockKey = `login:${email}`;
      if (isLocked(lockKey)) {
        res.status(429).json({ error: 'Too many failed sign-in attempts. Try again in 15 minutes.' });
        return;
      }

      const row = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM clinicians WHERE LOWER(email) = ?',
        [email],
      );
      if (!row || !verifyPassword(password, String(row.password_hash))) {
        recordFailure(lockKey);
        res.status(401).json({ error: 'Invalid clinician email or password.' });
        return;
      }

      // Checked after the password so a stranger cannot probe which accounts exist or are disabled.
      if (row.disabled_at) {
        res.status(403).json({ error: 'This account has been deactivated. Contact your MDT administrator.' });
        return;
      }

      clearFailures(lockKey);
      const clinician = mapClinicianRow(row);
      const session = await createSession(clinician);
      res.json({ token: session.token, clinician });
    } catch (err) {
      fail(res, err, 'Login failed');
    }
  });

  app.post('/api/auth/register', async (req, res) => {
    try {
      const fullName = String(req.body?.fullName ?? '').trim();
      const email = String(req.body?.email ?? '').trim().toLowerCase();
      const password = String(req.body?.password ?? '');
      const specialty = String(req.body?.specialty ?? '') as SpecialtyRole;
      const title = String(req.body?.title ?? 'Attending Specialist').trim();
      if (!DEMO_MODE) {
        if (!REGISTRATION_CODE) {
          res.status(403).json({ error: 'Registration is closed on this server. Ask your administrator for an account.' });
          return;
        }
        // One shared bucket: stops anyone guessing the registration code, whatever IP they claim.
        if (isLocked('register-code')) {
          res.status(429).json({ error: 'Too many invalid registration codes. Try again in 15 minutes.' });
          return;
        }
        if (!codeMatches(String(req.body?.registrationCode ?? ''))) {
          recordFailure('register-code');
          res.status(403).json({ error: 'That registration code is not valid.' });
          return;
        }
      }

      if (
        !fullName ||
        !email ||
        !email.includes('@') ||
        password.length < 8 ||
        fullName.length > 160 ||
        email.length > 190 ||
        title.length > 160 ||
        password.length > 200 ||
        !VALID_ROLES.has(specialty)
      ) {
        res.status(400).json({
          error: 'Full name, valid email, specialty role, and password (8 to 200 chars) are required.',
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
      const session = await createSession(clinician);
      await logAudit(clinician, 'CLINICIAN_REGISTERED', 'clinician', clinician.id, `Registered ${clinician.specialty} account.`);
      res.status(201).json({ token: session.token, clinician });
    } catch (err) {
      fail(res, err, 'Registration failed');
    }
  });

  app.post('/api/auth/demo-session', async (req, res) => {
    if (!DEMO_MODE) {
      res.status(403).json({ error: 'Demo sessions are disabled on this server. Sign in with your clinician account.' });
      return;
    }
    try {
      const clinicianId = String(req.body?.clinicianId ?? 'clin-med-01').trim();
      const row = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM clinicians WHERE id = ?',
        [clinicianId],
      );
      if (!row || row.disabled_at) {
        res.status(404).json({ error: 'Requested clinician profile not found.' });
        return;
      }
      const clinician = mapClinicianRow(row);
      const session = await createSession(clinician);
      res.json({ token: session.token, clinician });
    } catch (err) {
      fail(res, err, 'Session creation failed');
    }
  });

  app.get('/api/auth/me', requireAuth, (req: AuthenticatedRequest, res) => {
    res.json({ clinician: req.clinician });
  });

  app.post('/api/auth/logout', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      await revokeSession(req.sessionToken);
      res.json({ ok: true });
    } catch (err) {
      fail(res, err, 'Sign-out failed');
    }
  });

  // Changing a password signs the account out everywhere else; the current session stays.
  app.post('/api/auth/password', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const currentPassword = String(req.body?.currentPassword ?? '');
      const newPassword = String(req.body?.newPassword ?? '');
      if (!currentPassword || newPassword.length < 8 || newPassword.length > 200) {
        res.status(400).json({ error: 'Enter your current password and a new password of 8 to 200 characters.' });
        return;
      }
      if (newPassword === currentPassword) {
        res.status(400).json({ error: 'The new password must differ from the current one.' });
        return;
      }

      const clinician = req.clinician!;
      const lockKey = `login:${clinician.email.toLowerCase()}`;
      if (isLocked(lockKey)) {
        res.status(429).json({ error: 'Too many failed attempts. Try again in 15 minutes.' });
        return;
      }
      const row = await db.queryOne<Record<string, unknown>>(
        'SELECT password_hash FROM clinicians WHERE id = ?',
        [clinician.id],
      );
      if (!row || !verifyPassword(currentPassword, String(row.password_hash))) {
        recordFailure(lockKey);
        // 400, not 401: the client treats a 401 on a signed-in request as an expired session.
        res.status(400).json({ error: 'Your current password is not correct.' });
        return;
      }

      clearFailures(lockKey);
      await db.execute('UPDATE clinicians SET password_hash = ? WHERE id = ?', [
        hashPassword(newPassword),
        clinician.id,
      ]);
      await revokeOtherSessions(clinician.id, req.sessionToken!);
      await logAudit(clinician, 'PASSWORD_CHANGED', 'clinician', clinician.id, 'Changed account password; other sessions signed out.');
      res.json({ ok: true });
    } catch (err) {
      fail(res, err, 'Password change failed');
    }
  });

  // --- Clinician administration (board chairs only) ---
  // Reset hands back a random one-time password; deactivation blocks sign-in and ends live sessions.
  async function loadManagedClinician(
    req: AuthenticatedRequest,
    res: express.Response,
  ): Promise<Record<string, unknown> | null> {
    if (!req.clinician!.isChair) {
      res.status(403).json({ error: 'Only a board chair can manage clinician accounts.' });
      return null;
    }
    if (req.params.id === req.clinician!.id) {
      res.status(400).json({ error: 'Manage your own account from the My Account tab.' });
      return null;
    }
    const row = await db.queryOne<Record<string, unknown>>('SELECT * FROM clinicians WHERE id = ?', [req.params.id]);
    if (!row) res.status(404).json({ error: 'Clinician not found.' });
    return row;
  }

  app.post('/api/auth/clinicians/:id/reset-password', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const target = await loadManagedClinician(req, res);
      if (!target) return;
      const temporaryPassword = crypto.randomBytes(12).toString('base64url');
      await db.execute('UPDATE clinicians SET password_hash = ? WHERE id = ?', [
        hashPassword(temporaryPassword),
        String(target.id),
      ]);
      await revokeAllSessions(String(target.id));
      clearFailures(`login:${String(target.email).toLowerCase()}`);
      await logAudit(req.clinician!, 'PASSWORD_RESET', 'clinician', String(target.id), `Reset the password for ${String(target.full_name)}; their sessions were ended.`);
      res.json({ temporaryPassword });
    } catch (err) {
      fail(res, err, 'Password reset failed');
    }
  });

  for (const [verb, deactivate] of [['deactivate', true], ['reactivate', false]] as const) {
    app.post(`/api/auth/clinicians/:id/${verb}`, requireAuth, async (req: AuthenticatedRequest, res) => {
      try {
        const target = await loadManagedClinician(req, res);
        if (!target) return;
        await db.execute('UPDATE clinicians SET disabled_at = ? WHERE id = ?', [
          deactivate ? new Date().toISOString() : null,
          String(target.id),
        ]);
        if (deactivate) await revokeAllSessions(String(target.id));
        await logAudit(
          req.clinician!,
          deactivate ? 'CLINICIAN_DEACTIVATED' : 'CLINICIAN_REACTIVATED',
          'clinician',
          String(target.id),
          `${deactivate ? 'Deactivated' : 'Reactivated'} the account of ${String(target.full_name)}.`,
        );
        const updated = await db.queryOne<Record<string, unknown>>('SELECT * FROM clinicians WHERE id = ?', [String(target.id)]);
        res.json({ clinician: mapClinicianRow(updated!) });
      } catch (err) {
        fail(res, err, `Failed to ${verb} clinician`);
      }
    });
  }

  // --- Patient Cases CRUD ---
  // Archived cases are hidden from the registry; ?archived=1 lists only those.
  app.get('/api/cases', requireAuth, async (req, res) => {
    try {
      const archivedClause = req.query.archived === '1' ? 'NOT NULL' : 'NULL';
      const rows = await db.query(
        `SELECT * FROM patient_cases WHERE archived_at IS ${archivedClause} ORDER BY updated_at DESC`,
      );
      res.json({ cases: rows.map(mapCaseRow) });
    } catch (err) {
      fail(res, err, 'Failed to load cases');
    }
  });

  app.get('/api/cases/:id', requireAuth, async (req, res) => {
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
      fail(res, err, 'Failed to load case');
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
      if (!Number.isInteger(ecog) || ecog < 0 || ecog > 4) {
        res.status(400).json({ error: 'ECOG performance status must be a whole number from 0 to 4.' });
        return;
      }
      if (!VALID_BOARDS.has(organBoard) || !VALID_URGENCIES.has(urgency) || !VALID_SEX.has(sex)) {
        res.status(400).json({ error: 'Invalid organ board, urgency or sex classification.' });
        return;
      }
      // Stay inside the column widths so MySQL never rejects the row with an opaque error.
      if (
        mrn.length > 64 ||
        patientInitials.length > 16 ||
        primaryDiagnosis.length > 255 ||
        histology.length > 255 ||
        tnmT.length > 16 ||
        tnmN.length > 16 ||
        tnmM.length > 16 ||
        clinicalSummary.length > 20000
      ) {
        res.status(400).json({ error: 'One or more fields exceed their maximum length.' });
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
          ecog,
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
      fail(res, err, 'Failed to create case');
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
      // Editing T, N or M without naming a stage group re-derives it, so the two can never disagree.
      const tnmChanged = tnmT !== current.tnmT || tnmN !== current.tnmN || tnmM !== current.tnmM;
      const stageGroup =
        req.body?.stageGroup !== undefined
          ? String(req.body.stageGroup).trim()
          : tnmChanged
            ? deriveStageGroup(tnmT, tnmN, tnmM)
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

      if (
        !Number.isInteger(ecog) ||
        ecog < 0 ||
        ecog > 4 ||
        !isPlainObject(pathology) ||
        !isPlainObject(genomics) ||
        [tnmT, tnmN, tnmM].some((v) => v.length > 16) ||
        stageGroup.length > 32 ||
        clinicalSummary.length > 20000
      ) {
        res.status(400).json({ error: 'ECOG must be 0 to 4, pathology and genomics must be objects, and staging fields must fit their length limits.' });
        return;
      }
      if (current.archivedAt) {
        res.status(409).json({ error: 'This case is archived. Restore it before editing.' });
        return;
      }

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
      fail(res, err, 'Failed to update case');
    }
  });

  // Archiving is a reversible soft delete: nothing is removed, so the clinical record and its audit trail survive.
  for (const [verb, archive] of [['archive', true], ['restore', false]] as const) {
    app.post(`/api/cases/:id/${verb}`, requireAuth, async (req: AuthenticatedRequest, res) => {
      try {
        const row = await db.queryOne<Record<string, unknown>>(
          'SELECT * FROM patient_cases WHERE id = ?',
          [req.params.id],
        );
        if (!row) {
          res.status(404).json({ error: 'Patient case not found.' });
          return;
        }
        const current = mapCaseRow(row);
        if (!req.clinician!.isChair && current.leadClinicianId !== req.clinician!.id) {
          res.status(403).json({ error: `Only the lead clinician or a board chair can ${verb} this case.` });
          return;
        }
        const now = new Date().toISOString();
        await db.execute('UPDATE patient_cases SET archived_at = ?, updated_at = ? WHERE id = ?', [
          archive ? now : null,
          now,
          current.id,
        ]);
        await logAudit(
          req.clinician!,
          archive ? 'CASE_ARCHIVED' : 'CASE_RESTORED',
          'patient_case',
          current.id,
          `${archive ? 'Archived' : 'Restored'} case ${current.mrn}.`,
        );
        const updated = await db.queryOne<Record<string, unknown>>(
          'SELECT * FROM patient_cases WHERE id = ?',
          [current.id],
        );
        res.json({ patientCase: mapCaseRow(updated!) });
      } catch (err) {
        fail(res, err, `Failed to ${verb} case`);
      }
    });
  }

  // --- Imaging RECIST Annotations ---
  app.get('/api/cases/:id/annotations', requireAuth, async (req, res) => {
    try {
      const rows = await db.query(
        'SELECT * FROM imaging_annotations WHERE case_id = ? ORDER BY created_at DESC',
        [req.params.id],
      );
      res.json({ annotations: rows.map(mapAnnotationRow) });
    } catch (err) {
      fail(res, err, 'Failed to load annotations');
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

      if (
        !label ||
        !Number.isFinite(lengthMm) ||
        lengthMm < 0 ||
        ![x1, y1, x2, y2].every(Number.isFinite) ||
        !Number.isInteger(sliceIndex) ||
        sliceIndex < 0 ||
        (meanHu !== null && !Number.isFinite(meanHu)) ||
        label.length > 160 ||
        seriesId.length > 64 ||
        lesionType.length > 32
      ) {
        res.status(400).json({ error: 'Valid lesion label, slice, coordinates and calibrated millimeter length are required.' });
        return;
      }
      if (!(await caseExists(caseId))) {
        res.status(404).json({ error: 'Patient case not found or archived.' });
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
      fail(res, err, 'Failed to save annotation');
    }
  });

  app.delete('/api/annotations/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      // Idempotent: deleting an already-removed measurement succeeds, but only a real removal is audited.
      const found = await db.queryOne('SELECT id FROM imaging_annotations WHERE id = ?', [req.params.id]);
      if (found) {
        await db.execute('DELETE FROM imaging_annotations WHERE id = ?', [req.params.id]);
        await logAudit(
          req.clinician!,
          'ANNOTATION_DELETED',
          'imaging_annotation',
          req.params.id,
          `Removed imaging measurement ${req.params.id}.`,
        );
      }
      res.json({ ok: true });
    } catch (err) {
      fail(res, err, 'Failed to delete annotation');
    }
  });

  // --- DICOM file storage ---
  // Files are stored byte-for-byte, headers included (owner decision: no tag stripping), so every
  // route here needs a session and responses are never cached or sniffed.
  const DICOM_MAX_FILE_BYTES = 10 * 1024 * 1024; // stays under common MySQL max_allowed_packet limits
  const DICOM_MAX_CASE_BYTES = 256 * 1024 * 1024;
  const DICOM_META_COLUMNS = 'id, case_id, filename, size_bytes, series_uid, series_label, uploaded_by_name, created_at';

  // Series UID and a readable label come from the DICOM header, so the viewer can keep studies apart.
  // Parsing stops at Rows (0028,0010); a file that will not parse is not DICOM and is rejected.
  function readSeriesInfo(body: Buffer): { uid: string | null; label: string } | null {
    try {
      const ds = dicomParser.parseDicom(new Uint8Array(body.buffer, body.byteOffset, body.length), {
        untilTag: 'x00280010',
      });
      const uid = ds.string('x0020000e')?.trim().slice(0, 128) || null;
      const parts = [ds.string('x00080060')?.trim(), ds.string('x0008103e')?.trim()].filter(Boolean);
      return { uid, label: (parts.join(' · ') || 'Unlabelled series').slice(0, 160) };
    } catch {
      return null;
    }
  }

  // One audit line per clinician, case and 10 minutes, however many slices they open.
  async function auditDicomView(clinician: NonNullable<AuthenticatedRequest['clinician']>, caseId: string): Promise<void> {
    const since = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const seen = await db.queryOne(
      'SELECT id FROM audit_logs WHERE actor_id = ? AND action = ? AND resource_id = ? AND created_at > ?',
      [clinician.id, 'DICOM_VIEWED', caseId, since],
    );
    if (!seen) await logAudit(clinician, 'DICOM_VIEWED', 'patient_case', caseId, `Opened stored imaging for case ${caseId}.`);
  }

  app.get('/api/cases/:id/dicom', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const rows = await db.query(
        `SELECT ${DICOM_META_COLUMNS} FROM dicom_files WHERE case_id = ? ORDER BY created_at ASC, id ASC`,
        [req.params.id],
      );
      if (rows.length > 0) await auditDicomView(req.clinician!, req.params.id);
      res.json({ files: rows.map(mapDicomRow) });
    } catch (err) {
      fail(res, err, 'Failed to list DICOM files');
    }
  });

  // One file per request (the client sends a series sequentially); auth runs before the body is buffered.
  app.post(
    '/api/cases/:id/dicom',
    requireAuth,
    express.raw({ type: () => true, limit: DICOM_MAX_FILE_BYTES }),
    async (req: AuthenticatedRequest, res) => {
      try {
        const caseId = req.params.id;
        const body: unknown = req.body;
        if (!Buffer.isBuffer(body) || body.length < 132 || body.toString('latin1', 128, 132) !== 'DICM') {
          res.status(400).json({ error: 'The file is not a DICOM Part 10 (.dcm) file.' });
          return;
        }
        const series = readSeriesInfo(body);
        if (!series) {
          res.status(400).json({ error: 'The file could not be read as DICOM.' });
          return;
        }
        if (!(await caseExists(caseId))) {
          res.status(404).json({ error: 'Patient case not found or archived.' });
          return;
        }

        const filename =
          String(req.query.name ?? '').replace(/[^\w.\- ()]/g, '_').slice(0, 160) || 'slice.dcm';
        const sha256 = crypto.createHash('sha256').update(body).digest('hex');

        // Re-uploading the same file is a no-op, so a retried or repeated upload never doubles the series.
        const duplicate = await db.queryOne<Record<string, unknown>>(
          `SELECT ${DICOM_META_COLUMNS} FROM dicom_files WHERE case_id = ? AND sha256 = ?`,
          [caseId, sha256],
        );
        if (duplicate) {
          res.json({ file: mapDicomRow(duplicate), duplicate: true });
          return;
        }

        const used = await db.queryOne<{ total: number }>(
          'SELECT COALESCE(SUM(size_bytes), 0) AS total FROM dicom_files WHERE case_id = ?',
          [caseId],
        );
        if (Number(used?.total ?? 0) + body.length > DICOM_MAX_CASE_BYTES) {
          res.status(413).json({ error: 'This case has reached its 256 MB imaging storage limit.' });
          return;
        }

        const id = `dcm-${crypto.randomUUID().slice(0, 12)}`;
        const now = new Date().toISOString();
        await db.execute(
          `INSERT INTO dicom_files (
            id, case_id, filename, size_bytes, sha256, uploaded_by_id, uploaded_by_name, created_at, data,
            series_uid, series_label
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, caseId, filename, body.length, sha256, req.clinician!.id, req.clinician!.fullName, now, body,
            series.uid, series.label,
          ],
        );

        // One audit line per upload batch (the client numbers its files), not one per slice.
        if (!req.query.i || req.query.i === '1') {
          const batch = Number(req.query.n) > 1 ? `${Number(req.query.n)} DICOM files` : 'a DICOM file';
          await logAudit(req.clinician!, 'DICOM_UPLOADED', 'patient_case', caseId, `Began storing ${batch} for case ${caseId}.`);
        }

        const created = await db.queryOne<Record<string, unknown>>(
          `SELECT ${DICOM_META_COLUMNS} FROM dicom_files WHERE id = ?`,
          [id],
        );
        res.status(201).json({ file: mapDicomRow(created!) });
      } catch (err) {
        fail(res, err, 'Failed to store DICOM file');
      }
    },
  );

  app.get('/api/dicom/:id', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const row = await db.queryOne<Record<string, unknown>>(
        'SELECT case_id, filename, data FROM dicom_files WHERE id = ?',
        [req.params.id],
      );
      if (!row) {
        res.status(404).json({ error: 'DICOM file not found.' });
        return;
      }
      await auditDicomView(req.clinician!, String(row.case_id));
      res.setHeader('Content-Type', 'application/dicom');
      res.setHeader('Content-Disposition', `attachment; filename="${String(row.filename).replace(/"/g, '')}"`);
      res.send(row.data as Buffer);
    } catch (err) {
      fail(res, err, 'Failed to read DICOM file');
    }
  });

  // Removes every stored file for the case. Archiving a case never touches its images.
  app.delete('/api/cases/:id/dicom', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const row = await db.queryOne<Record<string, unknown>>(
        'SELECT * FROM patient_cases WHERE id = ?',
        [req.params.id],
      );
      if (!row) {
        res.status(404).json({ error: 'Patient case not found.' });
        return;
      }
      const current = mapCaseRow(row);
      if (!req.clinician!.isChair && current.leadClinicianId !== req.clinician!.id) {
        res.status(403).json({ error: 'Only the lead clinician or a board chair can delete stored imaging.' });
        return;
      }
      const count = await db.queryOne<{ total: number }>(
        'SELECT COUNT(*) AS total FROM dicom_files WHERE case_id = ?',
        [current.id],
      );
      await db.execute('DELETE FROM dicom_files WHERE case_id = ?', [current.id]);
      await logAudit(
        req.clinician!,
        'DICOM_DELETED',
        'patient_case',
        current.id,
        `Deleted ${Number(count?.total ?? 0)} stored DICOM file(s) from case ${current.mrn}.`,
      );
      res.json({ ok: true, deleted: Number(count?.total ?? 0) });
    } catch (err) {
      fail(res, err, 'Failed to delete DICOM files');
    }
  });

  // --- Tumour Board Meetings & Scheduler ---
  app.get('/api/meetings', requireAuth, async (req, res) => {
    try {
      const archivedClause = req.query.archived === '1' ? 'NOT NULL' : 'NULL';
      const rows = await db.query(
        `SELECT * FROM mdt_meetings WHERE archived_at IS ${archivedClause} ORDER BY scheduled_start ASC`,
      );
      res.json({ meetings: rows.map(mapMeetingRow) });
    } catch (err) {
      fail(res, err, 'Failed to load meetings');
    }
  });

  app.post('/api/meetings', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const title = String(req.body?.title ?? '').trim();
      const organBoard = String(req.body?.organBoard ?? 'Multi-Organ');
      const scheduledStart = String(req.body?.scheduledStart ?? '').trim();
      const durationMinutes = Number(req.body?.durationMinutes ?? 60);
      const agendaCaseIds: string[] = Array.isArray(req.body?.caseIds) ? req.body.caseIds : [];

      if (
        !title ||
        !scheduledStart ||
        title.length > 200 ||
        scheduledStart.length > 40 ||
        organBoard.length > 48 ||
        Number.isNaN(Date.parse(scheduledStart))
      ) {
        res.status(400).json({ error: 'Meeting title and a valid scheduled start date and time are required (title up to 200 characters).' });
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
      fail(res, err, 'Failed to schedule meeting');
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

      if (
        !VALID_ROOM_STATUSES.has(roomStatus) ||
        (activeCaseId !== null && (typeof activeCaseId !== 'string' || activeCaseId.length > 64)) ||
        agenda.length > 200
      ) {
        res.status(400).json({ error: 'Room status must be Scheduled, Live or Completed, and the agenda must be a list of at most 200 items.' });
        return;
      }
      if (current.archivedAt) {
        res.status(409).json({ error: 'This meeting is archived. Restore it before editing.' });
        return;
      }

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
      fail(res, err, 'Failed to update meeting');
    }
  });

  for (const [verb, archive] of [['archive', true], ['restore', false]] as const) {
    app.post(`/api/meetings/:id/${verb}`, requireAuth, async (req: AuthenticatedRequest, res) => {
      try {
        const row = await db.queryOne<Record<string, unknown>>(
          'SELECT * FROM mdt_meetings WHERE id = ?',
          [req.params.id],
        );
        if (!row) {
          res.status(404).json({ error: 'Meeting not found.' });
          return;
        }
        const current = mapMeetingRow(row);
        if (!req.clinician!.isChair && current.chairName !== req.clinician!.fullName) {
          res.status(403).json({ error: `Only the meeting chair or a board chair can ${verb} this meeting.` });
          return;
        }
        if (archive && current.roomStatus === 'Live') {
          res.status(409).json({ error: 'A live meeting cannot be archived. End the session first.' });
          return;
        }
        await db.execute('UPDATE mdt_meetings SET archived_at = ? WHERE id = ?', [
          archive ? new Date().toISOString() : null,
          current.id,
        ]);
        await logAudit(
          req.clinician!,
          archive ? 'MEETING_ARCHIVED' : 'MEETING_RESTORED',
          'mdt_meeting',
          current.id,
          `${archive ? 'Archived' : 'Restored'} meeting "${current.title}".`,
        );
        const updated = await db.queryOne<Record<string, unknown>>(
          'SELECT * FROM mdt_meetings WHERE id = ?',
          [current.id],
        );
        res.json({ meeting: mapMeetingRow(updated!) });
      } catch (err) {
        fail(res, err, `Failed to ${verb} meeting`);
      }
    });
  }

  // --- Consensus Votes & Sign-Off ---
  app.get('/api/cases/:id/votes', requireAuth, async (req, res) => {
    try {
      const rows = await db.query(
        'SELECT * FROM consensus_votes WHERE case_id = ? ORDER BY created_at DESC',
        [req.params.id],
      );
      res.json({ votes: rows.map(mapVoteRow) });
    } catch (err) {
      fail(res, err, 'Failed to load votes');
    }
  });

  app.post('/api/cases/:id/votes', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const caseId = req.params.id;
      const optionLabel = String(req.body?.optionLabel ?? '').trim();
      const rationale = String(req.body?.rationale ?? '').trim();
      const meetingId = req.body?.meetingId ? String(req.body.meetingId) : null;

      if (!optionLabel || optionLabel.length > 160 || rationale.length > 5000) {
        res.status(400).json({ error: 'Please choose a treatment pathway option (up to 160 characters) and keep the rationale under 5,000 characters.' });
        return;
      }
      if (!(await caseExists(caseId))) {
        res.status(404).json({ error: 'Patient case not found or archived.' });
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
      fail(res, err, 'Failed to cast vote');
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
      const signable = await db.queryOne<{ lead_clinician_id: string }>(
        'SELECT lead_clinician_id FROM patient_cases WHERE id = ? AND archived_at IS NULL',
        [caseId],
      );
      if (!signable) {
        res.status(404).json({ error: 'Patient case not found or archived.' });
        return;
      }
      // Sign-off locks the plan, so it stays with the board chair or the case's lead clinician (same rule as archive).
      if (!req.clinician!.isChair && signable.lead_clinician_id !== req.clinician!.id) {
        res.status(403).json({ error: "Only the board chair or the case's lead clinician can sign off a consensus." });
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
      fail(res, err, 'Failed to sign consensus');
    }
  });

  // --- Secure Case & Board Room Messaging ---
  app.get('/api/messages', requireAuth, async (req, res) => {
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
      fail(res, err, 'Failed to load messages');
    }
  });

  app.post('/api/messages', requireAuth, async (req: AuthenticatedRequest, res) => {
    try {
      const roomId = String(req.body?.roomId ?? '').trim();
      const caseId = req.body?.caseId ? String(req.body.caseId) : null;
      const tag = String(req.body?.tag ?? 'General').trim();
      const body = String(req.body?.body ?? '').trim();

      if (!roomId || !body || roomId.length > 96 || body.length > 4000 || !VALID_MESSAGE_TAGS.has(tag)) {
        res.status(400).json({ error: 'Message room and content (up to 4,000 characters) are required, with a valid tag.' });
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
      fail(res, err, 'Failed to send message');
    }
  });

  // --- Audit Trail ---
  app.get('/api/audit', requireAuth, async (_req, res) => {
    try {
      const rows = await db.query('SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 80');
      res.json({ logs: rows.map(mapAuditRow) });
    } catch (err) {
      fail(res, err, 'Failed to load audit log');
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
      // 503, not 502: Cloudflare (in front of production) swaps origin 502/504 bodies for its own HTML page.
      res.status(503).json({
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
      res.status(503).json({
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
      res.status(503).json({
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
      res.status(503).json({
        error: err instanceof Error ? err.message : 'AI copilot response failed.',
      });
    }
  });

  // Browsers ask for /favicon.ico on every visit and no page declares an icon; answer quietly instead of a 404 in the console.
  app.get('/favicon.ico', (_req, res) => res.status(204).end());

  // Unknown API paths must answer in JSON, not fall through to the site/SPA HTML.
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });

  // --- Mount Vite Dev Middleware or Production Static Bundle ---
  const server = http.createServer(app);
  boardHub.attach(server);

  // Marketing site at /, clinical app at /app (API and WebSocket stay at /api and /ws).
  const sitePath = path.resolve(process.cwd(), 'site');
  app.get(/^\/app$/, (_req, res) => res.redirect(301, '/app/'));

  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(express.static(sitePath, { extensions: ['html'] }));
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(process.cwd(), 'dist');
    // Browser caching keeps repeat visits off the Worker -> Hostinger path, whose CDN rate-limits bursts.
    // Vite assets are content-hashed, so they can be cached for a year; site.css/site.js are not, so 5 minutes.
    app.use(
      '/app',
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          if (filePath.includes(`${path.sep}assets${path.sep}`)) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );
    app.get('/app/*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    app.use(
      express.static(sitePath, {
        extensions: ['html'],
        setHeaders: (res, filePath) => {
          if (/\.(css|js)$/.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=300');
        },
      }),
    );
    app.use((_req, res) => {
      res.status(404).sendFile(path.join(sitePath, 'index.html'));
    });
  }

  // Last-resort handler so a bad request body returns JSON instead of an HTML stack trace.
  app.use((err: { status?: number; type?: string }, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (err.type === 'entity.too.large') {
      res.status(413).json({ error: 'The request is too large.' });
    } else if (err.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'The request body is not valid JSON.' });
    } else {
      console.error('[api] Unhandled error', err);
      res.status(err.status && err.status >= 400 && err.status < 500 ? err.status : 500).json({ error: 'Request failed.' });
    }
  });

  await purgeExpiredSessions();
  const sessionSweep = setInterval(() => {
    purgeExpiredSessions().catch((err) => console.error('[auth] Session cleanup failed:', err));
  }, 60 * 60 * 1000);
  sessionSweep.unref();

  const port = Number(process.env.PORT || 3000);
  server.listen(port, '0.0.0.0', () => {
    console.log(`[OncoBoard MDT] Server listening on http://0.0.0.0:${port} (SQL Engine: ${db.engine.toUpperCase()})`);
  });

  // Hosts send SIGTERM on redeploy: stop taking requests, then release the database cleanly.
  const shutdown = (signal: string) => {
    console.log(`[OncoBoard MDT] ${signal} received, shutting down.`);
    server.close(() => {
      db.close().finally(() => process.exit(0));
    });
    setTimeout(() => process.exit(0), 10_000).unref();
  };
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

bootstrap().catch((err) => {
  console.error('[OncoBoard MDT] Fatal startup error:', err);
  process.exit(1);
});
