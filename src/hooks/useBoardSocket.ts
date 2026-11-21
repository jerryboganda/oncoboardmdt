import { useCallback, useEffect, useRef, useState } from 'react';
import { getAuthToken } from '../services/api';
import type {
  CaseMessage,
  ConsensusVote,
  ImagingAnnotation,
  MdtMeeting,
  PatientCase,
  PresenceMember,
  PresenterSyncState,
} from '../types';

export interface BoardSocketCallbacks {
  onChatMessage?: (message: CaseMessage) => void;
  onVotesUpdated?: (payload: { caseId: string; votes: ConsensusVote[] }) => void;
  onPresenterSync?: (sync: PresenterSyncState) => void;
  onAnnotationSaved?: (annotation: ImagingAnnotation) => void;
  onConsensusSigned?: (payload: { caseId: string; patientCase: PatientCase }) => void;
  onMeetingUpdated?: (meeting: MdtMeeting) => void;
}

export function useBoardSocket(
  roomId: string | null,
  tokenVersion: string | null,
  callbacks: BoardSocketCallbacks,
) {
  const [connected, setConnected] = useState(false);
  const [presence, setPresence] = useState<PresenceMember[]>([]);
  const [presenterSync, setPresenterSync] = useState<PresenterSyncState | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  useEffect(() => {
    const token = getAuthToken();
    if (!roomId || !token) {
      setConnected(false);
      setPresence([]);
      return;
    }

    let cancelled = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const connect = () => {
      if (cancelled) return;
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const url = `${protocol}//${window.location.host}/ws?room=${encodeURIComponent(
        roomId,
      )}&token=${encodeURIComponent(token)}`;

      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        if (!cancelled) setConnected(true);
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        try {
          const parsed = JSON.parse(event.data) as {
            type: string;
            presence?: PresenceMember[];
            presenterSync?: PresenterSyncState | null;
            payload?: unknown;
          };

          switch (parsed.type) {
            case 'room:init':
              if (Array.isArray(parsed.presence)) setPresence(parsed.presence);
              if (parsed.presenterSync) {
                setPresenterSync(parsed.presenterSync);
                callbacksRef.current.onPresenterSync?.(parsed.presenterSync);
              }
              break;
            case 'presence:update':
              if (Array.isArray(parsed.presence)) setPresence(parsed.presence);
              break;
            case 'chat:new':
              callbacksRef.current.onChatMessage?.(parsed.payload as CaseMessage);
              break;
            case 'vote:updated':
              callbacksRef.current.onVotesUpdated?.(
                parsed.payload as { caseId: string; votes: ConsensusVote[] },
              );
              break;
            case 'presenter:sync':
              setPresenterSync(parsed.payload as PresenterSyncState);
              callbacksRef.current.onPresenterSync?.(parsed.payload as PresenterSyncState);
              break;
            case 'annotation:saved':
              callbacksRef.current.onAnnotationSaved?.(parsed.payload as ImagingAnnotation);
              break;
            case 'consensus:signed':
              callbacksRef.current.onConsensusSigned?.(
                parsed.payload as { caseId: string; patientCase: PatientCase },
              );
              break;
            case 'meeting:updated':
              callbacksRef.current.onMeetingUpdated?.(parsed.payload as MdtMeeting);
              break;
          }
        } catch {
          // Ignore malformed payload
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        setConnected(false);
        reconnectTimer = setTimeout(connect, 2500);
      };

      ws.onerror = () => {
        ws.close();
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [roomId, tokenVersion]);

  const emitPresenterSync = useCallback(
    (payload: {
      meetingId: string;
      caseId: string;
      sliceIndex: number;
      windowCenter: number;
      windowWidth: number;
    }) => {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'presenter:sync', payload }));
      }
    },
    [],
  );

  return { connected, presence, presenterSync, emitPresenterSync };
}
