import { useCallback, useEffect, useState } from 'react';
import { MotionConfig } from 'motion/react';
import { AuditAndInfraView } from './components/AuditAndInfraView';
import { CaseDossierView } from './components/CaseDossierView';
import { ClinicalAnalyticsView } from './components/ClinicalAnalyticsView';
import { ClinicianAuthModal } from './components/ClinicianAuthModal';
import { CommandPalette } from './components/CommandPalette';
import { DashboardView } from './components/DashboardView';
import { LiveBoardRoom } from './components/LiveBoardRoom';
import { MeetingsView } from './components/MeetingsView';
import { PageTransition } from './components/MotionPrimitives';
import { NewCaseModal } from './components/NewCaseModal';
import { Sidebar, type ActiveNavSection } from './components/Sidebar';
import { ToastProvider, useToast } from './components/ToastProvider';
import { TopBar } from './components/TopBar';
import type { CommandActionPayload } from './lib/commandSearch';
import type { BoardColorKey } from './lib/organPalette';
import { api, setAuthToken, setSessionExpiredHandler } from './services/api';
import type { Clinician, MdtMeeting, OrganBoard, PatientCase } from './types';

function OncoBoardShell() {
  const { pushToast } = useToast();
  const [theme, setTheme] = useState<'light' | 'dark'>('dark');
  const [activeSection, setActiveSection] = useState<ActiveNavSection>('registry');
  const [selectedOrgan, setSelectedOrgan] = useState<OrganBoard | 'All'>('All');
  const [openCaseId, setOpenCaseId] = useState<string | null>(null);
  const [activeMeetingId, setActiveMeetingId] = useState<string | null>(null);

  const [cases, setCases] = useState<PatientCase[]>([]);
  const [archivedCases, setArchivedCases] = useState<PatientCase[]>([]);
  const [meetings, setMeetings] = useState<MdtMeeting[]>([]);
  const [archivedMeetings, setArchivedMeetings] = useState<MdtMeeting[]>([]);
  const [clinicians, setClinicians] = useState<Clinician[]>([]);
  const [activeClinician, setActiveClinician] = useState<Clinician | null>(null);
  const [tokenVersion, setTokenVersion] = useState<string | null>(null);
  const [authConfig, setAuthConfig] = useState({ demoMode: false, registrationOpen: false });

  const [loading, setLoading] = useState(true);
  const [bootError, setBootError] = useState<string | null>(null);
  const [newCaseOpen, setNewCaseOpen] = useState(false);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Sync Tailwind v4 .dark class on <html>
  useEffect(() => {
    document.documentElement.classList.toggle('dark', theme === 'dark');
  }, [theme]);

  // Global Cmd/Ctrl + K Command Palette Shortcut
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  // Every read needs a session, so the workspace loads only after sign-in.
  const loadWorkspace = useCallback(async () => {
    const [cliniciansRes, casesRes, archivedRes, meetingsRes, archivedMeetingsRes] = await Promise.all([
      api.getClinicians(),
      api.getCases(),
      api.getArchivedCases(),
      api.getMeetings(),
      api.getArchivedMeetings(),
    ]);
    setClinicians(cliniciansRes.clinicians);
    setCases(casesRes.cases);
    setArchivedCases(archivedRes.cases);
    setMeetings(meetingsRes.meetings);
    setArchivedMeetings(archivedMeetingsRes.meetings);
    const live = meetingsRes.meetings.find((m) => m.roomStatus === 'Live') ?? meetingsRes.meetings[0];
    if (live) setActiveMeetingId(live.id);
  }, []);

  // Bootstrap: demo servers sign in automatically; production asks the clinician to sign in
  useEffect(() => {
    let mounted = true;
    const init = async () => {
      try {
        const config = await api.getAuthConfig();
        if (!mounted) return;
        setAuthConfig(config);
        if (!config.demoMode) {
          setAuthModalOpen(true);
          return;
        }
        const sessionRes = await api.startDemoSession('clin-med-01');
        if (!mounted) return;
        setAuthToken(sessionRes.token);
        setActiveClinician(sessionRes.clinician);
        setTokenVersion(sessionRes.token);
        await loadWorkspace();
      } catch (err) {
        if (mounted) {
          setBootError(err instanceof Error ? err.message : 'Unable to connect to OncoBoard server.');
        }
      } finally {
        if (mounted) setLoading(false);
      }
    };
    void init();
    return () => {
      mounted = false;
    };
  }, [loadWorkspace]);

  // Drops every clinical record from memory and returns to the sign-in prompt.
  const handleSignedOut = useCallback(() => {
    setActiveClinician(null);
    setTokenVersion(null);
    setCases([]);
    setArchivedCases([]);
    setMeetings([]);
    setArchivedMeetings([]);
    setClinicians([]);
    setOpenCaseId(null);
    setActiveMeetingId(null);
    setActiveSection('registry');
    setAuthModalOpen(true);
  }, []);

  useEffect(() => {
    setSessionExpiredHandler(() => {
      handleSignedOut();
      pushToast({
        title: 'Session expired',
        description: 'Sign in again to continue. Saved work is unaffected.',
        variant: 'warning',
      });
    });
    return () => setSessionExpiredHandler(null);
  }, [handleSignedOut, pushToast]);

  const handleToggleTheme = useCallback(() => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    pushToast({
      title: next === 'dark' ? 'Dark Radiology Mode enabled' : 'Clinical Light Mode enabled',
      description:
        next === 'dark'
          ? 'Low-glare reading-room palette active.'
          : 'High-contrast daylight consultation palette active.',
      variant: 'info',
      durationMs: 2600,
    });
  }, [theme, pushToast]);

  const handleSelectSection = (section: ActiveNavSection) => {
    setActiveSection(section);
    setOpenCaseId(null);
  };

  const handleOpenCase = (caseId: string) => {
    setOpenCaseId(caseId);
    setActiveSection('registry');
  };

  const handleEnterLiveMeeting = (meetingId: string) => {
    setActiveMeetingId(meetingId);
    setOpenCaseId(null);
    setActiveSection('live-board');
  };

  const handleCaseCreated = (created: PatientCase) => {
    setCases((prev) => [created, ...prev]);
    setOpenCaseId(created.id);
    setActiveSection('registry');
  };

  const handleCaseUpdated = (updated: PatientCase) => {
    setCases((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
  };

  const handleCaseArchived = (archived: PatientCase) => {
    setCases((prev) => prev.filter((c) => c.id !== archived.id));
    setArchivedCases((prev) => [archived, ...prev]);
    setOpenCaseId(null);
  };

  const handleCaseRestored = (restored: PatientCase) => {
    setArchivedCases((prev) => prev.filter((c) => c.id !== restored.id));
    setCases((prev) => [restored, ...prev]);
  };

  const handleMeetingArchived = (archived: MdtMeeting) => {
    setMeetings((prev) => prev.filter((m) => m.id !== archived.id));
    setArchivedMeetings((prev) => [archived, ...prev]);
    setActiveMeetingId((prev) => (prev === archived.id ? null : prev));
  };

  const handleMeetingRestored = (restored: MdtMeeting) => {
    setArchivedMeetings((prev) => prev.filter((m) => m.id !== restored.id));
    setMeetings((prev) =>
      [...prev, restored].sort((a, b) => a.scheduledStart.localeCompare(b.scheduledStart)),
    );
  };

  const handleMeetingCreated = (created: MdtMeeting) => {
    setMeetings((prev) => [...prev, created]);
  };

  const handleMeetingUpdated = (updated: MdtMeeting) => {
    setMeetings((prev) => prev.map((m) => (m.id === updated.id ? updated : m)));
  };

  const handleExecuteCommand = useCallback(
    (action: CommandActionPayload) => {
      switch (action.type) {
        case 'open-case':
          setOpenCaseId(action.caseId);
          setActiveSection('registry');
          break;
        case 'open-meeting':
          setActiveMeetingId(action.meetingId);
          setOpenCaseId(null);
          setActiveSection('live-board');
          break;
        case 'navigate-section':
          setActiveSection(action.section);
          setOpenCaseId(null);
          break;
        case 'filter-board':
          setSelectedOrgan(action.board);
          setOpenCaseId(null);
          if (activeSection !== 'analytics') setActiveSection('registry');
          break;
        case 'new-case':
          setNewCaseOpen(true);
          break;
        case 'toggle-theme':
          handleToggleTheme();
          break;
        case 'open-auth':
          setAuthModalOpen(true);
          break;
      }
    },
    [activeSection, handleToggleTheme],
  );

  const activeMeeting =
    meetings.find((m) => m.id === activeMeetingId) ??
    meetings.find((m) => m.roomStatus === 'Live') ??
    meetings[0] ??
    null;

  const activeCaseForBreadcrumb = openCaseId ? cases.find((c) => c.id === openCaseId) : null;

  let breadcrumbParent = 'OncoBoard MDT';
  let breadcrumbCurrent = 'Multi-Organ Case Registry';
  let activeBoardAccent: BoardColorKey | null = selectedOrgan !== 'All' ? selectedOrgan : null;

  if (openCaseId && activeCaseForBreadcrumb) {
    breadcrumbParent = `${activeCaseForBreadcrumb.organBoard} Board`;
    breadcrumbCurrent = `${activeCaseForBreadcrumb.mrn} — Patient Dossier`;
    activeBoardAccent = activeCaseForBreadcrumb.organBoard;
  } else if (activeSection === 'analytics') {
    breadcrumbParent = 'Clinical Intelligence';
    breadcrumbCurrent =
      selectedOrgan === 'All' ? 'Clinical Analytics' : `Clinical Analytics · ${selectedOrgan} Board`;
  } else if (activeSection === 'meetings') {
    breadcrumbParent = 'Coordination';
    breadcrumbCurrent = 'Tumour Board Schedule';
    activeBoardAccent = 'Multi-Organ';
  } else if (activeSection === 'live-board') {
    breadcrumbParent = 'Live Session';
    breadcrumbCurrent = activeMeeting?.title ?? 'Live Tumour Board Room';
    activeBoardAccent = activeMeeting?.organBoard ?? 'Multi-Organ';
  } else if (activeSection === 'audit') {
    breadcrumbParent = 'Governance';
    breadcrumbCurrent = 'Audit Trail & MySQL Architecture';
    activeBoardAccent = null;
  } else if (selectedOrgan !== 'All') {
    breadcrumbParent = 'Case Registry';
    breadcrumbCurrent = `${selectedOrgan} Oncology Board`;
  }

  const pageViewKey = openCaseId ? `case-${openCaseId}` : `section-${activeSection}`;

  return (
    <div className="min-h-screen flex bg-canvas text-ink transition-colors duration-200">
      <Sidebar
        activeSection={activeSection}
        onSelectSection={handleSelectSection}
        cases={cases}
        selectedOrganFilter={selectedOrgan}
        onSelectOrganFilter={(board) => {
          setSelectedOrgan(board);
          setOpenCaseId(null);
        }}
        clinician={activeClinician}
        onOpenAuthModal={() => setAuthModalOpen(true)}
        onOpenCommandPalette={() => setCommandPaletteOpen(true)}
        mobileOpen={mobileMenuOpen}
        onCloseMobile={() => setMobileMenuOpen(false)}
        hasLiveMeeting={meetings.some((m) => m.roomStatus === 'Live')}
      />

      <div className="flex-1 flex flex-col min-w-0">
        <TopBar
          breadcrumbParent={breadcrumbParent}
          breadcrumbCurrent={breadcrumbCurrent}
          activeBoardAccent={activeBoardAccent}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onOpenNewCase={() => setNewCaseOpen(true)}
          onOpenMobileMenu={() => setMobileMenuOpen(true)}
        />

        <main className="flex-1 min-w-0">
          {bootError ? (
            <div className="p-6 max-w-xl mx-auto mt-10 rounded-lg bg-panel border border-rose-300 dark:border-rose-800 space-y-2">
              <h2 className="font-display text-base font-semibold text-rose-700 dark:text-rose-400">
                Clinical Server Connection Error
              </h2>
              <p className="text-xs text-slate-600 dark:text-slate-300">{bootError}</p>
            </div>
          ) : !activeClinician && !loading ? (
            <div className="py-12 px-6 text-center">
              <p className="text-sm font-medium text-ink">Sign in to open the Case Registry</p>
              <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                Cases, meetings and votes are available to signed-in clinicians only.
              </p>
              <button
                type="button"
                onClick={() => setAuthModalOpen(true)}
                className="mt-4 inline-flex items-center gap-1.5 px-4 py-2 rounded-md bg-blue-700 hover:bg-blue-800 dark:bg-sky-500 dark:hover:bg-sky-400 text-white dark:text-slate-950 text-xs font-semibold transition-colors whitespace-nowrap disabled:opacity-50"
              >
                Sign In
              </button>
            </div>
          ) : (
            <PageTransition viewKey={pageViewKey}>
              {openCaseId ? (
                <CaseDossierView
                  caseId={openCaseId}
                  tokenVersion={tokenVersion}
                  onBack={() => setOpenCaseId(null)}
                  onCaseUpdated={handleCaseUpdated}
                  onCaseArchived={handleCaseArchived}
                />
              ) : activeSection === 'registry' ? (
                <DashboardView
                  cases={cases}
                  archivedCases={archivedCases}
                  onCaseRestored={handleCaseRestored}
                  meetings={meetings}
                  selectedOrgan={selectedOrgan}
                  onSelectOrgan={setSelectedOrgan}
                  onOpenCase={handleOpenCase}
                  onEnterLiveMeeting={handleEnterLiveMeeting}
                  onOpenNewCase={() => setNewCaseOpen(true)}
                  loading={loading}
                />
              ) : activeSection === 'analytics' ? (
                <ClinicalAnalyticsView
                  cases={cases}
                  meetings={meetings}
                  theme={theme}
                  selectedOrgan={selectedOrgan}
                  onSelectOrgan={setSelectedOrgan}
                  onOpenBoardInRegistry={(board) => {
                    setSelectedOrgan(board);
                    setOpenCaseId(null);
                    setActiveSection('registry');
                  }}
                  loading={loading}
                />
              ) : activeSection === 'meetings' ? (
                <MeetingsView
                  meetings={meetings}
                  cases={cases}
                  onMeetingCreated={handleMeetingCreated}
                  onMeetingUpdated={handleMeetingUpdated}
                  archivedMeetings={archivedMeetings}
                  onMeetingArchived={handleMeetingArchived}
                  onMeetingRestored={handleMeetingRestored}
                  onEnterLiveRoom={handleEnterLiveMeeting}
                />
              ) : activeSection === 'live-board' && activeMeeting ? (
                <LiveBoardRoom
                  meeting={activeMeeting}
                  cases={cases}
                  clinician={activeClinician}
                  tokenVersion={tokenVersion}
                  onCaseUpdated={handleCaseUpdated}
                  onMeetingUpdated={handleMeetingUpdated}
                  onOpenFullDossier={handleOpenCase}
                />
              ) : (
                <AuditAndInfraView />
              )}
            </PageTransition>
          )}
        </main>
      </div>

      <NewCaseModal
        open={newCaseOpen}
        onClose={() => setNewCaseOpen(false)}
        onCreated={handleCaseCreated}
      />

      <ClinicianAuthModal
        open={authModalOpen}
        onClose={() => setAuthModalOpen(false)}
        clinicians={clinicians}
        activeClinician={activeClinician}
        demoMode={authConfig.demoMode}
        registrationOpen={authConfig.registrationOpen}
        onSignedOut={handleSignedOut}
        onAuthenticated={(clinician, token) => {
          const firstSignIn = !activeClinician;
          setActiveClinician(clinician);
          setTokenVersion(token);
          if (firstSignIn) {
            loadWorkspace().catch((err) =>
              setBootError(err instanceof Error ? err.message : 'Unable to load the clinical workspace.'),
            );
          } else if (!clinicians.some((c) => c.id === clinician.id)) {
            setClinicians((prev) => [...prev, clinician]);
          }
        }}
      />

      <CommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        cases={cases}
        meetings={meetings}
        theme={theme}
        onExecute={handleExecuteCommand}
      />
    </div>
  );
}

export default function App() {
  return (
    <MotionConfig reducedMotion="user">
      <ToastProvider>
        <OncoBoardShell />
      </ToastProvider>
    </MotionConfig>
  );
}
