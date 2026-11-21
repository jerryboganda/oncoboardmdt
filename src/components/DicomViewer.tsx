import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type MouseEvent, type WheelEvent } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Columns2,
  Contrast,
  Crosshair,
  FileCode2,
  Pause,
  Play,
  Radio,
  RotateCcw,
  Ruler,
  Sparkles,
  Trash2,
  Upload,
  X,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  buildPreloadedDicomVolume,
  calculateRecistDistanceMm,
  CLINICAL_WINDOW_PRESETS,
  parseDicomPart10Buffer,
  renderSliceToRgba,
  sampleLineMeanHu,
  storedValueToHu,
  type DicomSeriesVolume,
} from '../lib/dicomEngine';
import { evaluateRecistResponse } from '../lib/clinicalRules';
import { api } from '../services/api';
import type {
  AiDicomImpressionResult,
  DicomFileMeta,
  ImagingAnnotation,
  PatientCase,
  PresenterSyncState,
} from '../types';
import { CLINICAL_SPRING, SlidingHighlight, SpringModal } from './MotionPrimitives';
import { useToast } from './ToastProvider';

type ViewerTool = 'probe' | 'wl' | 'ruler';
type ParsedDicom = ReturnType<typeof parseDicomPart10Buffer>;

const seriesKeyOf = (f: DicomFileMeta) => f.seriesUid ?? 'unknown';

// Files that share a SeriesInstanceUID are one series; the viewer shows one series at a time.
function groupBySeries(files: DicomFileMeta[]) {
  const groups = new Map<string, { key: string; label: string; files: DicomFileMeta[] }>();
  for (const f of files) {
    const key = seriesKeyOf(f);
    const group = groups.get(key) ?? { key, label: f.seriesLabel ?? 'Unlabelled series', files: [] };
    group.files.push(f);
    groups.set(key, group);
  }
  return [...groups.values()];
}

function buildUploadedVolume(parsed: ParsedDicom[], seriesId: string): DicomSeriesVolume {
  const sorted = [...parsed].sort((a, b) => a.slice.instanceNumber - b.slice.instanceNumber);
  const first = sorted[0];
  return {
    seriesId,
    studyDescription: first.studyDescription,
    seriesDescription: first.seriesDescription,
    modality: first.modality,
    patientName: first.patientName,
    patientId: first.patientId,
    studyDate: first.studyDate,
    institution: first.institution,
    isUploadedDicom: true,
    defaultWindowCenter: first.slice.defaultWindowCenter,
    defaultWindowWidth: first.slice.defaultWindowWidth,
    slices: sorted.map((p) => p.slice),
  };
}

interface DicomViewerProps {
  patientCase: PatientCase;
  annotations: ImagingAnnotation[];
  onAnnotationAdded: (annotation: ImagingAnnotation) => void;
  onAnnotationDeleted: (annotationId: string) => void;
  externalSync?: PresenterSyncState | null;
  followPresenter?: boolean;
  onBroadcastSync?: (state: {
    sliceIndex: number;
    windowCenter: number;
    windowWidth: number;
  }) => void;
  compact?: boolean;
}

interface DraftMeasurement {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lengthMm: number;
  meanHu: number;
}

export function DicomViewer({
  patientCase,
  annotations,
  onAnnotationAdded,
  onAnnotationDeleted,
  externalSync,
  followPresenter = false,
  onBroadcastSync,
  compact = false,
}: DicomViewerProps) {
  const { pushToast } = useToast();
  const preloadedCurrent = useMemo(
    () =>
      buildPreloadedDicomVolume(
        patientCase.dicomPreset,
        patientCase.mrn,
        patientCase.patientInitials,
        false,
      ),
    [patientCase.dicomPreset, patientCase.mrn, patientCase.patientInitials],
  );

  const preloadedPrior = useMemo(
    () =>
      buildPreloadedDicomVolume(
        patientCase.dicomPreset,
        patientCase.mrn,
        patientCase.patientInitials,
        true,
      ),
    [patientCase.dicomPreset, patientCase.mrn, patientCase.patientInitials],
  );

  const [uploadedVolume, setUploadedVolume] = useState<DicomSeriesVolume | null>(null);
  const [activeSource, setActiveSource] = useState<'current' | 'uploaded'>('current');
  const [comparePrior, setComparePrior] = useState(false);

  const activeVolume = activeSource === 'uploaded' && uploadedVolume ? uploadedVolume : preloadedCurrent;

  const [sliceIndex, setSliceIndex] = useState(11);
  const [windowCenter, setWindowCenter] = useState(activeVolume.defaultWindowCenter);
  const [windowWidth, setWindowWidth] = useState(activeVolume.defaultWindowWidth);
  const [zoom, setZoom] = useState(1);
  const [invert, setInvert] = useState(false);
  const [tool, setTool] = useState<ViewerTool>('probe');
  const [cinePlaying, setCinePlaying] = useState(false);
  const [showTags, setShowTags] = useState(false);

  const [hoverInfo, setHoverInfo] = useState<{ x: number; y: number; hu: number } | null>(null);
  const [draftRuler, setDraftRuler] = useState<DraftMeasurement | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const dragStartRef = useRef<{ x: number; y: number; wc: number; ww: number } | null>(null);

  const [annotLabel, setAnnotLabel] = useState('');
  const [annotType, setAnnotType] = useState<ImagingAnnotation['lesionType']>('Target (RECIST)');
  const [savingAnnot, setSavingAnnot] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadStatus, setUploadStatus] = useState<string | null>(null);
  const [storedFiles, setStoredFiles] = useState<DicomFileMeta[]>([]);
  const [seriesKey, setSeriesKey] = useState<string | null>(null);
  const [reloadTick, setReloadTick] = useState(0);
  const storedFilesRef = useRef<DicomFileMeta[]>([]);
  const seriesGroups = useMemo(() => groupBySeries(storedFiles), [storedFiles]);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [aiImpression, setAiImpression] = useState<AiDicomImpressionResult | null>(null);

  const mainCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const priorCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Ask the server what imaging this case holds, then pick the biggest series to show first.
  // Every clinician therefore sees the same stored series, and a reload keeps it.
  useEffect(() => {
    let active = true;
    setUploadedVolume(null);
    setActiveSource('current');
    setUploadStatus(null);
    setUploadError(null);
    storedFilesRef.current = [];
    setStoredFiles([]);
    setSeriesKey(null);

    api
      .getDicomFiles(patientCase.id)
      .then(({ files }) => {
        if (!active || files.length === 0) return;
        storedFilesRef.current = files;
        setStoredFiles(files);
        const biggest = groupBySeries(files).reduce((best, g) => (g.files.length >= best.files.length ? g : best));
        setSeriesKey(biggest.key);
      })
      .catch((err) => {
        if (active) {
          setUploadError(
            `Stored imaging could not be loaded: ${err instanceof Error ? err.message : 'unknown error'}`,
          );
        }
      });
    return () => {
      active = false;
    };
  }, [patientCase.id]);

  // Download and decode the selected series (again after an upload, so the view always matches what is stored).
  useEffect(() => {
    if (!seriesKey) return;
    let active = true;
    const files = storedFilesRef.current.filter((f) => seriesKeyOf(f) === seriesKey);
    if (files.length === 0) return;

    const load = async () => {
      try {
        setUploadError(null);
        setUploadStatus(`Loading ${files.length} stored slice(s) from the server...`);
        const parsed: ParsedDicom[] = new Array(files.length);
        let next = 0;
        const worker = async () => {
          while (active && next < files.length) {
            const i = next++;
            const buffer = await api.downloadDicomFile(files[i].id);
            parsed[i] = parseDicomPart10Buffer(buffer, files[i].filename, i + 1);
          }
        };
        await Promise.all([worker(), worker(), worker(), worker()]);
        if (!active) return;
        const vol = buildUploadedVolume(parsed, `STORED-${patientCase.id}-${seriesKey}`);
        setUploadedVolume(vol);
        setActiveSource('uploaded');
        setUploadStatus(
          `Loaded ${vol.slices.length} stored slice(s) from the server — ${vol.modality} (${vol.seriesDescription}).`,
        );
      } catch (err) {
        if (!active) return;
        setUploadStatus(null);
        setUploadError(
          `Stored imaging could not be loaded: ${err instanceof Error ? err.message : 'unknown error'}`,
        );
      }
    };
    void load();
    return () => {
      active = false;
    };
  }, [patientCase.id, seriesKey, reloadTick]);

  // Reset viewport when switching patient case or series source
  useEffect(() => {
    const mid = Math.min(Math.floor(activeVolume.slices.length / 2), activeVolume.slices.length - 1);
    setSliceIndex(mid);
    setWindowCenter(activeVolume.defaultWindowCenter);
    setWindowWidth(activeVolume.defaultWindowWidth);
    setZoom(1);
    setInvert(false);
    setDraftRuler(null);
    setAiImpression(null);
    setAiError(null);
  }, [activeVolume]);

  // Apply Presenter Sync when following another clinician in a Live Board Room
  useEffect(() => {
    if (!followPresenter || !externalSync || externalSync.caseId !== patientCase.id) return;
    const clamped = Math.max(0, Math.min(activeVolume.slices.length - 1, externalSync.sliceIndex));
    setSliceIndex(clamped);
    setWindowCenter(externalSync.windowCenter);
    setWindowWidth(externalSync.windowWidth);
  }, [followPresenter, externalSync, patientCase.id, activeVolume.slices.length]);

  // Cine playback loop
  useEffect(() => {
    if (!cinePlaying) return;
    const timer = setInterval(() => {
      setSliceIndex((prev) => (prev + 1) % activeVolume.slices.length);
    }, 180);
    return () => clearInterval(timer);
  }, [cinePlaying, activeVolume.slices.length]);

  const currentSlice = activeVolume.slices[Math.min(sliceIndex, activeVolume.slices.length - 1)];
  const priorSlice = preloadedPrior.slices[Math.min(sliceIndex, preloadedPrior.slices.length - 1)];

  const recistSummary = useMemo(
    () => evaluateRecistResponse(patientCase.baselineSumMm, annotations),
    [patientCase.baselineSumMm, annotations],
  );

  // Render primary DICOM canvas + calibrated RECIST overlays
  useEffect(() => {
    const canvas = mainCanvasRef.current;
    if (!canvas || !currentSlice) return;
    canvas.width = currentSlice.cols;
    canvas.height = currentSlice.rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rgba = renderSliceToRgba(currentSlice, windowCenter, windowWidth, invert);
    const imgData = new ImageData(new Uint8ClampedArray(rgba), currentSlice.cols, currentSlice.rows);
    ctx.putImageData(imgData, 0, 0);

    // Draw saved annotations on this slice
    const sliceAnnots = annotations.filter((a) => a.sliceIndex === sliceIndex);
    for (const a of sliceAnnots) {
      ctx.save();
      ctx.strokeStyle = a.lesionType === 'Target (RECIST)' ? '#38BDF8' : '#F59E0B';
      ctx.lineWidth = 1.75;
      ctx.beginPath();
      ctx.moveTo(a.x1, a.y1);
      ctx.lineTo(a.x2, a.y2);
      ctx.stroke();

      // End ticks
      ctx.fillStyle = ctx.strokeStyle;
      ctx.beginPath();
      ctx.arc(a.x1, a.y1, 2.5, 0, Math.PI * 2);
      ctx.arc(a.x2, a.y2, 2.5, 0, Math.PI * 2);
      ctx.fill();

      // Compact label tag
      ctx.font = '600 10px "JetBrains Mono", monospace';
      const txt = `${a.lengthMm.toFixed(1)}mm`;
      const tx = Math.min(currentSlice.cols - 48, Math.max(4, (a.x1 + a.x2) / 2 - 18));
      const ty = Math.max(14, Math.min(a.y1, a.y2) - 6);
      ctx.fillStyle = 'rgba(5, 7, 11, 0.8)';
      ctx.fillRect(tx - 3, ty - 10, txt.length * 6.4 + 6, 13);
      ctx.fillStyle = '#38BDF8';
      ctx.fillText(txt, tx, ty);
      ctx.restore();
    }

    // Draw active draft ruler
    if (draftRuler) {
      ctx.save();
      ctx.strokeStyle = '#22C55E';
      ctx.lineWidth = 2;
      ctx.setLineDash([4, 2]);
      ctx.beginPath();
      ctx.moveTo(draftRuler.x1, draftRuler.y1);
      ctx.lineTo(draftRuler.x2, draftRuler.y2);
      ctx.stroke();
      ctx.setLineDash([]);

      ctx.fillStyle = '#22C55E';
      ctx.beginPath();
      ctx.arc(draftRuler.x1, draftRuler.y1, 3, 0, Math.PI * 2);
      ctx.arc(draftRuler.x2, draftRuler.y2, 3, 0, Math.PI * 2);
      ctx.fill();

      ctx.font = '600 10px "JetBrains Mono", monospace';
      const txt = `${draftRuler.lengthMm.toFixed(1)}mm (${draftRuler.meanHu} HU)`;
      const tx = Math.min(currentSlice.cols - 95, Math.max(4, draftRuler.x2 + 6));
      const ty = Math.max(14, draftRuler.y2 - 6);
      ctx.fillStyle = 'rgba(5, 7, 11, 0.85)';
      ctx.fillRect(tx - 3, ty - 10, txt.length * 6.2 + 6, 13);
      ctx.fillStyle = '#4ADE80';
      ctx.fillText(txt, tx, ty);
      ctx.restore();
    }
  }, [currentSlice, windowCenter, windowWidth, invert, annotations, sliceIndex, draftRuler]);

  // Render prior comparison canvas when side-by-side mode is enabled
  useEffect(() => {
    if (!comparePrior) return;
    const canvas = priorCanvasRef.current;
    if (!canvas || !priorSlice) return;
    canvas.width = priorSlice.cols;
    canvas.height = priorSlice.rows;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rgba = renderSliceToRgba(priorSlice, windowCenter, windowWidth, invert);
    const imgData = new ImageData(new Uint8ClampedArray(rgba), priorSlice.cols, priorSlice.rows);
    ctx.putImageData(imgData, 0, 0);
  }, [comparePrior, priorSlice, windowCenter, windowWidth, invert]);

  const getCanvasPixelCoords = useCallback(
    (e: MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
      const canvas = mainCanvasRef.current;
      if (!canvas || !currentSlice) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      const scaleX = currentSlice.cols / rect.width;
      const scaleY = currentSlice.rows / rect.height;
      const x = Math.min(currentSlice.cols - 1, Math.max(0, Math.round((e.clientX - rect.left) * scaleX)));
      const y = Math.min(currentSlice.rows - 1, Math.max(0, Math.round((e.clientY - rect.top) * scaleY)));
      return { x, y };
    },
    [currentSlice],
  );

  const handleCanvasMouseDown = (e: MouseEvent<HTMLCanvasElement>) => {
    const pos = getCanvasPixelCoords(e);
    setIsDragging(true);
    dragStartRef.current = { x: e.clientX, y: e.clientY, wc: windowCenter, ww: windowWidth };
    if (tool === 'ruler') {
      setDraftRuler({
        x1: pos.x,
        y1: pos.y,
        x2: pos.x,
        y2: pos.y,
        lengthMm: 0,
        meanHu: sampleLineMeanHu(currentSlice, pos.x, pos.y, pos.x, pos.y),
      });
    }
  };

  const handleCanvasMouseMove = (e: MouseEvent<HTMLCanvasElement>) => {
    if (!currentSlice) return;
    const pos = getCanvasPixelCoords(e);
    const raw = currentSlice.pixelData[pos.y * currentSlice.cols + pos.x] ?? 0;
    const hu = Math.round(
      storedValueToHu(raw, currentSlice.rescaleSlope, currentSlice.rescaleIntercept),
    );
    setHoverInfo({ x: pos.x, y: pos.y, hu });

    if (!isDragging || !dragStartRef.current) return;

    if (tool === 'wl') {
      const dx = e.clientX - dragStartRef.current.x;
      const dy = e.clientY - dragStartRef.current.y;
      setWindowWidth(Math.max(20, Math.round(dragStartRef.current.ww + dx * 4)));
      setWindowCenter(Math.round(dragStartRef.current.wc - dy * 3));
    } else if (tool === 'ruler' && draftRuler) {
      const lengthMm = calculateRecistDistanceMm(
        draftRuler.x1,
        draftRuler.y1,
        pos.x,
        pos.y,
        currentSlice.pixelSpacingMm,
      );
      const meanHu = sampleLineMeanHu(currentSlice, draftRuler.x1, draftRuler.y1, pos.x, pos.y);
      setDraftRuler({ ...draftRuler, x2: pos.x, y2: pos.y, lengthMm, meanHu });
    }
  };

  const handleCanvasMouseUp = () => {
    setIsDragging(false);
    dragStartRef.current = null;
  };

  const handleWheel = (e: WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 1 : -1;
    setSliceIndex((prev) =>
      Math.max(0, Math.min(activeVolume.slices.length - 1, prev + delta)),
    );
  };

  const handleDicomFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    // Copy first: the input is cleared right after this call returns.
    const list = Array.from(files);
    setUploadError(null);
    setUploadStatus(null);

    let vol: DicomSeriesVolume;
    try {
      const parsedSlices: ParsedDicom[] = [];
      for (let i = 0; i < list.length; i++) {
        const buffer = await list[i].arrayBuffer();
        parsedSlices.push(parseDicomPart10Buffer(buffer, list[i].name, i + 1));
      }
      vol = buildUploadedVolume(parsedSlices, `UPLOADED-${Date.now()}`);
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Unable to parse uploaded DICOM files.');
      return;
    }

    const loadedMessage = `Loaded ${vol.slices.length} real DICOM slice(s) — ${vol.modality} (${vol.seriesDescription}).`;
    setUploadedVolume(vol);
    setActiveSource('uploaded');
    setUploadStatus(loadedMessage);
    pushToast({
      title: `Loaded ${vol.slices.length} DICOM slice(s)`,
      description: `${vol.modality} · ${vol.seriesDescription}`,
      variant: 'success',
      organBoard: patientCase.organBoard,
    });

    // Keep a copy on the server so the series is still there after a reload and for the rest of the board.
    let stored = 0;
    try {
      for (const file of list) {
        setUploadStatus(`${loadedMessage} Storing on the server: ${stored} of ${list.length}...`);
        await api.uploadDicomFile(patientCase.id, file, stored + 1, list.length);
        stored += 1;
      }
      const before = new Set(storedFilesRef.current.map((f) => f.id));
      const { files: all } = await api.getDicomFiles(patientCase.id);
      const added = all.find((f) => !before.has(f.id));
      storedFilesRef.current = all;
      setStoredFiles(all);
      if (added) setSeriesKey(seriesKeyOf(added));
      setReloadTick((t) => t + 1);
      setUploadStatus(`${loadedMessage} Stored ${stored} file(s) on the server.`);
      pushToast({
        title: `Stored ${stored} DICOM file(s)`,
        description: `Available to every clinician on ${patientCase.mrn}.`,
        variant: 'success',
        organBoard: patientCase.organBoard,
      });
    } catch (err) {
      setUploadStatus(loadedMessage);
      setUploadError(
        `Viewing locally, but server storage stopped after ${stored} of ${list.length} file(s): ${
          err instanceof Error ? err.message : 'unknown error'
        }`,
      );
    }
  };

  const handleDeleteStored = async () => {
    setDeleting(true);
    setDeleteError(null);
    try {
      const { deleted } = await api.deleteDicomFiles(patientCase.id);
      setUploadedVolume(null);
      setActiveSource('current');
      storedFilesRef.current = [];
      setStoredFiles([]);
      setSeriesKey(null);
      setUploadStatus(null);
      setUploadError(null);
      setDeleteOpen(false);
      pushToast({
        title: `Deleted ${deleted} stored DICOM file(s)`,
        description: `${patientCase.mrn} is back on the preloaded series.`,
        variant: 'info',
        organBoard: patientCase.organBoard,
      });
    } catch (err) {
      setDeleteError(err instanceof Error ? err.message : 'Unable to delete the stored series.');
    } finally {
      setDeleting(false);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    void handleDicomFiles(e.target.files);
    e.target.value = '';
  };

  const handleSaveAnnotation = async () => {
    if (!draftRuler || draftRuler.lengthMm <= 0) return;
    setSavingAnnot(true);
    try {
      const label =
        annotLabel.trim() ||
        `Target Lesion S${sliceIndex + 1} (${draftRuler.lengthMm.toFixed(1)} mm)`;
      const { annotation } = await api.saveAnnotation(patientCase.id, {
        seriesId: activeVolume.seriesId,
        sliceIndex,
        label,
        lesionType: annotType,
        x1: draftRuler.x1,
        y1: draftRuler.y1,
        x2: draftRuler.x2,
        y2: draftRuler.y2,
        lengthMm: draftRuler.lengthMm,
        meanHu: draftRuler.meanHu,
      });
      onAnnotationAdded(annotation);
      setDraftRuler(null);
      setAnnotLabel('');
      pushToast({
        title: 'RECIST measurement saved',
        description: `${annotation.label} (${annotation.lengthMm.toFixed(1)} mm) persisted to chart.`,
        variant: 'success',
        organBoard: patientCase.organBoard,
      });
    } finally {
      setSavingAnnot(false);
    }
  };

  const handleQuickCalibrateLesion = () => {
    // Provides a quick centered RECIST caliper on the active slice that clinicians can immediately adjust or save
    const x1 = 70;
    const y1 = 118;
    const x2 = 104;
    const y2 = 118;
    const lengthMm = calculateRecistDistanceMm(x1, y1, x2, y2, currentSlice.pixelSpacingMm);
    const meanHu = sampleLineMeanHu(currentSlice, x1, y1, x2, y2);
    setTool('ruler');
    setDraftRuler({ x1, y1, x2, y2, lengthMm, meanHu });
  };

  const handleDeleteAnnotation = async (id: string) => {
    await api.deleteAnnotation(id);
    onAnnotationDeleted(id);
    pushToast({
      title: 'Measurement removed',
      description: 'Lesion caliper removed from patient chart.',
      variant: 'info',
      organBoard: patientCase.organBoard,
    });
  };

  const handleRunAiDicomAssist = async () => {
    const canvas = mainCanvasRef.current;
    if (!canvas) return;
    setAiLoading(true);
    setAiError(null);
    try {
      const snapshotBase64 = canvas.toDataURL('image/png');
      const { impression } = await api.aiDicomAssist({
        caseId: patientCase.id,
        snapshotBase64,
        sliceMeta: {
          modality: activeVolume.modality,
          sliceIndex,
          totalSlices: activeVolume.slices.length,
          windowCenter,
          windowWidth,
          seriesDescription: activeVolume.seriesDescription,
        },
      });
      setAiImpression(impression);
    } catch (err) {
      setAiError(err instanceof Error ? err.message : 'Unable to run AI slice impression assist.');
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* PACS Diagnostic Toolbar */}
      <div className="p-3 rounded-lg bg-panel border border-hairline flex flex-wrap items-center justify-between gap-2.5">
        <div className="flex flex-wrap items-center gap-1.5">
          {/* Primary PACS Interaction Tools with Gliding Spring Indicator */}
          <div className="flex items-center gap-1 p-0.5 rounded-md bg-slate-100 dark:bg-slate-900">
            {(
              [
                { id: 'probe', label: 'HU Probe', Icon: Crosshair },
                { id: 'wl', label: 'Window/Level', Icon: Contrast },
                { id: 'ruler', label: 'RECIST Ruler', Icon: Ruler },
              ] as const
            ).map(({ id, label, Icon }) => {
              const active = tool === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTool(id)}
                  className={`relative inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                    active
                      ? 'text-ink'
                      : 'text-ink-muted hover:text-slate-900 dark:hover:text-slate-200'
                  }`}
                >
                  {active && (
                    <SlidingHighlight
                      layoutId={`dicom-tool-${compact ? 'compact' : 'full'}`}
                      className="bg-white dark:bg-slate-800 shadow-xs"
                    />
                  )}
                  <Icon className="relative z-10 h-3.5 w-3.5" aria-hidden="true" />
                  <span className="relative z-10">{label}</span>
                </button>
              );
            })}
          </div>

          {/* Viewport Actions */}
          <button
            type="button"
            onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.2).toFixed(1))))}
            aria-label="Zoom in DICOM viewport"
            className="p-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ZoomIn className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setZoom((z) => Math.max(0.8, Number((z - 0.2).toFixed(1))))}
            aria-label="Zoom out DICOM viewport"
            className="p-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <ZoomOut className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => setInvert((v) => !v)}
            className={`px-2.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap ${
              invert
                ? 'border-blue-600 text-blue-700 dark:border-sky-400 dark:text-sky-300 bg-blue-50 dark:bg-sky-500/10'
                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            Invert
          </button>
          <button
            type="button"
            onClick={() => setCinePlaying((p) => !p)}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            {cinePlaying ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
            <span>{cinePlaying ? 'Pause Cine' : 'Cine Loop'}</span>
          </button>
          <button
            type="button"
            onClick={() => setComparePrior((v) => !v)}
            className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-md border text-xs font-medium whitespace-nowrap ${
              comparePrior
                ? 'border-blue-600 text-blue-700 dark:border-sky-400 dark:text-sky-300 bg-blue-50 dark:bg-sky-500/10'
                : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Columns2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Compare Prior</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setWindowCenter(activeVolume.defaultWindowCenter);
              setWindowWidth(activeVolume.defaultWindowWidth);
              setZoom(1);
              setInvert(false);
            }}
            aria-label="Reset window level and zoom"
            className="p-2 rounded-md border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
        </div>

        {/* Right Controls: Real .dcm Upload, Tags, AI Slice Assist, Broadcast */}
        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept=".dcm,application/dicom"
            multiple
            onChange={handleFileInputChange}
            className="hidden"
          />
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <Upload className="h-3.5 w-3.5" aria-hidden="true" />
            <span>Upload .DCM Files</span>
          </button>
          {seriesGroups.length > 1 && (
            <>
              <label htmlFor="stored-series" className="sr-only">
                Stored series
              </label>
              <select
                id="stored-series"
                value={seriesKey ?? ''}
                onChange={(e) => setSeriesKey(e.target.value)}
                className="px-3 py-1.5 rounded-md text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
              >
                {seriesGroups.map((g) => (
                  <option key={g.key} value={g.key}>
                    {g.label} ({g.files.length})
                  </option>
                ))}
              </select>
            </>
          )}
          {storedFiles.length > 0 && (
            <button
              type="button"
              onClick={() => {
                setDeleteError(null);
                setDeleteOpen(true);
              }}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
            >
              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Delete Stored Series</span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowTags((s) => !s)}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 whitespace-nowrap"
          >
            <FileCode2 className="h-3.5 w-3.5" aria-hidden="true" />
            <span>DICOM Tags</span>
          </button>
          {onBroadcastSync && (
            <motion.button
              type="button"
              whileTap={{ scale: 0.97 }}
              onClick={() => {
                onBroadcastSync({ sliceIndex, windowCenter, windowWidth });
                pushToast({
                  title: `Broadcasted Slice ${sliceIndex + 1} to Board`,
                  description: `Synced WW ${windowWidth} / WL ${windowCenter} to connected specialists.`,
                  variant: 'info',
                  organBoard: patientCase.organBoard,
                });
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-emerald-700 hover:bg-emerald-800 text-white text-xs font-semibold whitespace-nowrap transition-colors"
            >
              <Radio className="h-3.5 w-3.5" aria-hidden="true" />
              <span>Sync Slice to Board</span>
            </motion.button>
          )}
          <motion.button
            type="button"
            whileTap={{ scale: 0.97 }}
            onClick={handleRunAiDicomAssist}
            disabled={aiLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold whitespace-nowrap disabled:opacity-50 transition-colors"
          >
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            <span>{aiLoading ? 'Analyzing Slice...' : 'AI Slice Assist'}</span>
          </motion.button>
        </div>
      </div>

      {/* Upload Feedback */}
      {uploadError && (
        <div role="alert" className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          {uploadError}
        </div>
      )}
      {uploadStatus && (
        <div className="p-3 rounded-md bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 text-xs text-emerald-800 dark:text-emerald-300 flex items-center justify-between gap-2">
          <span>{uploadStatus}</span>
          <button
            type="button"
            onClick={() => setActiveSource(activeSource === 'uploaded' ? 'current' : 'uploaded')}
            className="underline font-medium"
          >
            {activeSource === 'uploaded' ? 'Switch back to preloaded CT/MRI' : 'View uploaded series'}
          </button>
        </div>
      )}

      {/* Main Split Stage: Obsidian Diagnostic Viewport + Right Clinical Sidecar */}
      <div className={`grid grid-cols-1 ${compact ? 'xl:grid-cols-12' : 'lg:grid-cols-12'} gap-4`}>
        {/* Left/Center: Diagnostic Black PACS Viewport */}
        <div className={`${compact ? 'xl:col-span-8' : 'lg:col-span-8'} flex flex-col rounded-lg bg-[#05070B] border border-slate-800 overflow-hidden`}>
          {/* Window/Level Preset Bar */}
          <div className="px-3 py-2 border-b border-slate-800/90 flex flex-wrap items-center justify-between gap-2 bg-[#090D16] text-xs">
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[11px] font-mono text-slate-400 mr-1">W/L Presets:</span>
              {CLINICAL_WINDOW_PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    setWindowCenter(preset.windowCenter);
                    setWindowWidth(preset.windowWidth);
                  }}
                  className="px-2 py-1 rounded text-[11px] font-medium text-slate-300 hover:bg-slate-800 hover:text-white transition-colors"
                >
                  {preset.label}
                </button>
              ))}
            </div>
            <div className="font-mono text-[11px] tabular-nums text-sky-400">
              WW: {windowWidth} · WL: {windowCenter} · Zoom: {Math.round(zoom * 100)}%
            </div>
          </div>

          {/* Canvas Container (Mouse Wheel Scrubbing) */}
          <div
            onWheel={handleWheel}
            className={`relative flex-1 min-h-[380px] ${compact ? 'h-[400px]' : 'h-[470px]'} bg-[#05070B] grid ${
              comparePrior ? 'grid-cols-2 divide-x divide-slate-800' : 'grid-cols-1'
            } select-none overflow-hidden`}
          >
            {/* Primary Study Viewport */}
            <div className="relative flex items-center justify-center overflow-hidden p-6">
              {/* Top-Left DICOM Patient Overlay */}
              <div className="pointer-events-none absolute top-3 left-3 z-10 font-mono text-[11px] leading-tight text-slate-300 space-y-0.5">
                <div className="font-semibold text-white">
                  {activeVolume.patientId} · {activeVolume.patientName}
                </div>
                <div className="text-slate-400">{activeVolume.studyDescription}</div>
                <div className="text-slate-400">{activeVolume.seriesDescription}</div>
              </div>

              {/* Top-Right Modality & Date */}
              <div className="pointer-events-none absolute top-3 right-3 z-10 font-mono text-[11px] leading-tight text-right text-slate-300 space-y-0.5 tabular-nums">
                <div className="text-sky-400 font-semibold">{activeVolume.modality} AXIAL</div>
                <div>{activeVolume.studyDate}</div>
                <div>
                  Im: {sliceIndex + 1}/{activeVolume.slices.length}
                </div>
              </div>

              <canvas
                ref={mainCanvasRef}
                data-testid="dicom-main-canvas"
                onMouseDown={handleCanvasMouseDown}
                onMouseMove={handleCanvasMouseMove}
                onMouseUp={handleCanvasMouseUp}
                onMouseLeave={() => {
                  setIsDragging(false);
                  setHoverInfo(null);
                }}
                style={{
                  transform: `scale(${zoom})`,
                }}
                className={`max-h-full max-w-full w-auto h-full aspect-square transition-transform duration-100 ${
                  tool === 'ruler'
                    ? 'cursor-crosshair'
                    : tool === 'wl'
                      ? 'cursor-ew-resize'
                      : 'cursor-crosshair'
                }`}
              />

              {/* Bottom-Left Slice Location & HU Probe HUD */}
              <div className="pointer-events-none absolute bottom-3 left-3 z-10 font-mono text-[11px] tabular-nums text-slate-300">
                <span>Loc: {currentSlice.sliceLocationMm.toFixed(1)} mm</span>
                <span className="mx-2 text-slate-600">|</span>
                <span>
                  Spacing: {currentSlice.pixelSpacingMm[0]}×{currentSlice.pixelSpacingMm[1]} mm
                </span>
                {hoverInfo && (
                  <>
                    <span className="mx-2 text-slate-600">|</span>
                    <span className="text-sky-400">
                      ({hoverInfo.x}, {hoverInfo.y}) {hoverInfo.hu} HU
                    </span>
                  </>
                )}
              </div>

              {/* Bottom-Right Orientation Marker */}
              <div className="pointer-events-none absolute bottom-3 right-3 z-10 font-mono text-[11px] text-slate-400">
                Tool: {tool === 'probe' ? 'HU Probe' : tool === 'wl' ? 'W/L Drag' : 'RECIST Ruler'}
              </div>
            </div>

            {/* Prior Baseline Comparison Viewport */}
            {comparePrior && (
              <div className="relative flex items-center justify-center overflow-hidden p-3 bg-[#05070B]">
                <div className="pointer-events-none absolute top-3 left-3 z-10 font-mono text-[11px] leading-tight text-amber-300 space-y-0.5">
                  <div className="font-semibold">BASELINE PRIOR COMPARISON</div>
                  <div className="text-slate-400">{preloadedPrior.studyDate}</div>
                </div>
                <canvas
                  ref={priorCanvasRef}
                  data-testid="dicom-prior-canvas"
                  style={{
                    transform: `scale(${zoom})`,
                  }}
                  className="max-h-full max-w-full w-auto h-full aspect-square"
                />
                <div className="pointer-events-none absolute bottom-3 left-3 z-10 font-mono text-[11px] tabular-nums text-slate-400">
                  Synced Slice {sliceIndex + 1}/{preloadedPrior.slices.length}
                </div>
              </div>
            )}
          </div>

          {/* Slice Scrubber Rail */}
          <div className="px-4 py-2.5 bg-[#090D16] border-t border-slate-800 flex items-center gap-3">
            <label htmlFor="dicom-slice-slider" className="text-xs font-mono text-slate-300 whitespace-nowrap tabular-nums">
              Slice {sliceIndex + 1} / {activeVolume.slices.length}
            </label>
            <input
              id="dicom-slice-slider"
              type="range"
              min={0}
              max={activeVolume.slices.length - 1}
              value={sliceIndex}
              onChange={(e) => setSliceIndex(Number(e.target.value))}
              className="flex-1 accent-sky-400"
            />
            <button
              type="button"
              onClick={handleQuickCalibrateLesion}
              className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-sky-300 text-xs font-medium whitespace-nowrap"
            >
              + Place Caliper
            </button>
          </div>
        </div>

        {/* Right Sidecar: RECIST 1.1 Tracker, Draft Save, Saved Annotations & DICOM Tags */}
        <div className={`${compact ? 'xl:col-span-4' : 'lg:col-span-4'} space-y-4`}>
          {/* RECIST 1.1 Quantitative Summary */}
          <div className="p-4 rounded-lg bg-panel border border-hairline space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="font-display text-xs font-semibold text-ink">
                RECIST 1.1 Target Response
              </h3>
              <span
                className={`font-mono text-xs font-semibold ${
                  recistSummary.responseCode === 'PR' || recistSummary.responseCode === 'CR'
                    ? 'text-emerald-700 dark:text-emerald-400'
                    : recistSummary.responseCode === 'PD'
                      ? 'text-rose-700 dark:text-rose-400'
                      : 'text-amber-700 dark:text-amber-400'
                }`}
              >
                {recistSummary.responseCode}
              </span>
            </div>
            <div className="grid grid-cols-3 gap-2 text-center py-2 border-y border-hairline">
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Baseline</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-ink">
                  {recistSummary.baselineSumMm} mm
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Current Sum</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-ink">
                  {recistSummary.currentSumMm} mm
                </p>
              </div>
              <div>
                <p className="text-[11px] text-slate-500 dark:text-slate-400">Delta</p>
                <p className="font-mono text-sm font-semibold tabular-nums text-blue-700 dark:text-sky-400">
                  {recistSummary.percentChange > 0 ? '+' : ''}
                  {recistSummary.percentChange}%
                </p>
              </div>
            </div>
            <p className="text-xs text-ink-muted">{recistSummary.responseLabel}</p>
          </div>

          {/* Draft RECIST Measurement Save Form */}
          <AnimatePresence>
            {draftRuler && draftRuler.lengthMm > 0 && (
              <motion.div
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.98 }}
                transition={CLINICAL_SPRING}
                className="p-4 rounded-lg bg-panel border border-blue-500/60 dark:border-sky-500/60 space-y-3"
              >
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-semibold text-ink">
                    Save Calibrated Measurement
                  </h3>
                  <span className="font-mono text-xs font-semibold tabular-nums text-emerald-700 dark:text-emerald-400">
                    {draftRuler.lengthMm.toFixed(1)} mm · {draftRuler.meanHu} HU
                  </span>
                </div>
                <div>
                  <label htmlFor="annot-label" className="block text-xs text-ink-muted mb-1">
                    Lesion Label
                  </label>
                  <input
                    id="annot-label"
                    type="text"
                    value={annotLabel}
                    onChange={(e) => setAnnotLabel(e.target.value)}
                    placeholder="e.g. TL-2: Station 4R Mediastinal Node"
                    className="w-full px-2.5 py-1.5 rounded text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                  />
                </div>
                <div>
                  <label htmlFor="annot-type" className="block text-xs text-ink-muted mb-1">
                    Classification
                  </label>
                  <select
                    id="annot-type"
                    value={annotType}
                    onChange={(e) => setAnnotType(e.target.value as ImagingAnnotation['lesionType'])}
                    className="w-full px-2.5 py-1.5 rounded text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-ink"
                  >
                    <option value="Target (RECIST)">Target (RECIST)</option>
                    <option value="Non-Target">Non-Target</option>
                    <option value="New Lesion">New Lesion</option>
                    <option value="ROI Note">ROI Note</option>
                  </select>
                </div>
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setDraftRuler(null)}
                    className="px-3 py-1.5 rounded border border-slate-200 dark:border-slate-700 text-xs text-slate-600 dark:text-slate-300"
                  >
                    Discard
                  </button>
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.97 }}
                    disabled={savingAnnot}
                    onClick={handleSaveAnnotation}
                    className="px-3 py-1.5 rounded bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold disabled:opacity-50"
                  >
                    {savingAnnot ? 'Saving...' : 'Save to Chart'}
                  </motion.button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Saved Annotations List */}
          <div className="p-4 rounded-lg bg-panel border border-hairline space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-xs font-semibold text-ink">
                Saved Lesion Measurements ({annotations.length})
              </h3>
              <span className="text-[11px] text-slate-500 dark:text-slate-400 whitespace-nowrap shrink-0">
                Click to jump
              </span>
            </div>
            {annotations.length === 0 ? (
              <p className="text-xs text-slate-500 dark:text-slate-400 py-2">
                Select RECIST Ruler or click &ldquo;+ Place Caliper&rdquo; to measure and save a lesion.
              </p>
            ) : (
              <div className="divide-y divide-hairline max-h-56 overflow-y-auto">
                <AnimatePresence initial={false}>
                  {annotations.map((a) => (
                    <motion.div
                      key={a.id}
                      initial={{ opacity: 0, y: -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      transition={{ duration: 0.16 }}
                      className="py-2.5 flex items-start justify-between gap-2"
                    >
                      <button
                        type="button"
                        onClick={() => setSliceIndex(Math.min(activeVolume.slices.length - 1, a.sliceIndex))}
                        className="text-left min-w-0 flex-1 group"
                      >
                        <p className="text-xs font-medium text-ink group-hover:text-blue-700 dark:group-hover:text-sky-400 truncate transition-colors">
                          {a.label}
                        </p>
                        <p className="text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400 mt-0.5">
                          {a.lengthMm.toFixed(1)} mm · Slice {a.sliceIndex + 1}
                          {a.meanHu !== null ? ` · ${a.meanHu} HU` : ''}
                        </p>
                        <p className="text-[11px] text-slate-500 dark:text-slate-400">
                          {a.lesionType} · {a.authorName}
                        </p>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteAnnotation(a.id)}
                        aria-label={`Delete annotation ${a.label}`}
                        className="p-1 rounded text-slate-400 hover:text-rose-600 dark:hover:text-rose-400 transition-colors"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
          </div>

          {/* DICOM Metadata Tag Inspector */}
          <AnimatePresence>
            {showTags && (
              <motion.div
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={CLINICAL_SPRING}
                className="p-4 rounded-lg bg-panel border border-hairline space-y-2"
              >
                <h3 className="font-display text-xs font-semibold text-ink">
                  DICOM Header Tags (Slice {sliceIndex + 1})
                </h3>
                <div className="max-h-52 overflow-y-auto divide-y divide-hairline font-mono text-[11px]">
                  {currentSlice.tags.map((t) => (
                    <div key={t.tag} className="py-1.5 flex items-start justify-between gap-2">
                      <span className="text-slate-500 dark:text-slate-400 shrink-0">
                        {t.tag} {t.name}
                      </span>
                      <span className="text-ink text-right break-all">
                        {t.value}
                      </span>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* Multimodal AI Slice Impression Output */}
      {aiError && (
        <div role="alert" className="p-3.5 rounded-lg bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
          {aiError}
        </div>
      )}
      <AnimatePresence>
        {aiImpression && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={CLINICAL_SPRING}
            className="p-4 rounded-lg bg-panel border border-hairline space-y-2.5"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="font-display text-sm font-semibold text-ink">
                AI Radiological Decision-Support Observation — {aiImpression.anatomicalRegion}
              </h3>
              <span className="text-xs font-mono text-blue-700 dark:text-sky-400">
                Slice {sliceIndex + 1} Snapshot
              </span>
            </div>
            <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
              {aiImpression.lesionCharacterization}
            </p>
            <ul className="list-disc pl-4 space-y-1 text-xs text-ink-muted">
              {aiImpression.keyObservations.map((obs, idx) => (
                <li key={idx}>{obs}</li>
              ))}
            </ul>
            <p className="text-xs text-slate-700 dark:text-slate-300">
              <strong className="font-semibold">Suggested Follow-Up:</strong>{' '}
              {aiImpression.suggestedFollowUpImaging}
            </p>
            <p className="text-[11px] text-amber-700 dark:text-amber-400 pt-1 border-t border-hairline">
              {aiImpression.disclaimer}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      <SpringModal
        open={deleteOpen}
        onClose={() => !deleting && setDeleteOpen(false)}
        labelledBy="delete-dicom-title"
        maxWidthClass="max-w-md"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-hairline">
          <div>
            <h2 id="delete-dicom-title" className="font-display text-base font-semibold text-ink">
              Delete Stored Series
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              {patientCase.mrn} · cannot be undone
            </p>
          </div>
          <button
            type="button"
            onClick={() => setDeleteOpen(false)}
            disabled={deleting}
            aria-label="Close delete dialog"
            className="p-1.5 rounded text-slate-500 hover:text-slate-900 dark:hover:text-slate-100 transition-colors"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="p-6 space-y-4">
          {deleteError && (
            <div role="alert" className="p-3 rounded-md bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-800 text-xs text-rose-700 dark:text-rose-300">
              {deleteError}
            </div>
          )}
          <p className="text-xs leading-relaxed text-ink-muted">
            This permanently removes {storedFiles.length} stored DICOM file(s)
            {seriesGroups.length > 1 ? ` across ${seriesGroups.length} series` : ''} from the server for every clinician.
            Saved measurements stay. Only the lead clinician or a board chair can delete stored imaging.
          </p>
          <div className="flex items-center justify-end gap-2.5">
            <button
              type="button"
              onClick={() => setDeleteOpen(false)}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors whitespace-nowrap disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleDeleteStored}
              disabled={deleting}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete Stored Series'}
            </button>
          </div>
        </div>
      </SpringModal>
    </div>
  );
}
