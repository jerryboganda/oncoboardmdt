import type { IncomingMessage, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import { getSession } from './auth';
import type { PresenceMember, PresenterSyncState } from '../src/types';

interface ClientMeta {
  ws: WebSocket;
  roomId: string;
  member: PresenceMember;
}

// Cloudflare drops idle WebSockets after ~100 s, so ping well inside that window.
const HEARTBEAT_MS = 30_000;

class RealtimeBoardHub {
  private wss: WebSocketServer | null = null;
  private rooms = new Map<string, Set<ClientMeta>>();
  private presenterState = new Map<string, PresenterSyncState>();
  private alive = new WeakSet<WebSocket>();

  public attach(server: Server): void {
    // Clients only ever send small presenter-sync frames.
    this.wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });

    const heartbeat = setInterval(() => {
      for (const ws of this.wss?.clients ?? []) {
        if (!this.alive.has(ws)) {
          ws.terminate();
          continue;
        }
        this.alive.delete(ws);
        ws.ping();
      }
    }, HEARTBEAT_MS);
    heartbeat.unref();

    server.on('upgrade', async (req: IncomingMessage, socket, head) => {
      const reqUrl = new URL(req.url ?? '/', `http://${req.headers.host || 'localhost'}`);
      if (reqUrl.pathname !== '/ws') {
        return;
      }

      const token = reqUrl.searchParams.get('token');
      const roomId = (reqUrl.searchParams.get('room') || 'global').slice(0, 96);
      let session: Awaited<ReturnType<typeof getSession>> = null;
      try {
        session = await getSession(token);
      } catch (err) {
        console.error('[ws] Session lookup failed:', err);
      }

      if (!session || socket.destroyed) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss?.handleUpgrade(req, socket, head, (ws) => {
        this.registerClient(ws, roomId, {
          clinicianId: session!.clinician.id,
          fullName: session!.clinician.fullName,
          specialty: session!.clinician.specialty,
          joinedAt: new Date().toISOString(),
        });
      });
    });
  }

  private registerClient(ws: WebSocket, roomId: string, member: PresenceMember): void {
    const client: ClientMeta = { ws, roomId, member };
    this.alive.add(ws);
    ws.on('pong', () => this.alive.add(ws));
    // Without a listener an 'error' event (e.g. an oversized frame) is an uncaught exception that kills the process.
    ws.on('error', (err) => {
      console.warn('[ws] Client error:', err.message);
      ws.terminate();
    });
    if (!this.rooms.has(roomId)) {
      this.rooms.set(roomId, new Set());
    }
    this.rooms.get(roomId)!.add(client);

    // Send initial room state (presence + active presenter sync if any)
    this.send(ws, {
      type: 'room:init',
      roomId,
      presence: this.getPresenceList(roomId),
      presenterSync: this.presenterState.get(roomId) ?? null,
    });

    this.broadcastPresence(roomId);

    ws.on('message', (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type?: string;
          payload?: Record<string, unknown>;
        };
        if (msg.type === 'presenter:sync' && msg.payload) {
          const sync: PresenterSyncState = {
            meetingId: String(msg.payload.meetingId ?? roomId),
            caseId: String(msg.payload.caseId ?? ''),
            sliceIndex: Number(msg.payload.sliceIndex ?? 0),
            windowCenter: Number(msg.payload.windowCenter ?? 40),
            windowWidth: Number(msg.payload.windowWidth ?? 400),
            presenterName: member.fullName,
            updatedAt: new Date().toISOString(),
          };
          this.presenterState.set(roomId, sync);
          this.broadcast(roomId, { type: 'presenter:sync', payload: sync });
        }
      } catch {
        // Ignore malformed frames
      }
    });

    ws.on('close', () => {
      const set = this.rooms.get(roomId);
      if (set) {
        set.delete(client);
        if (set.size === 0) {
          this.rooms.delete(roomId);
        } else {
          this.broadcastPresence(roomId);
        }
      }
    });
  }

  private getPresenceList(roomId: string): PresenceMember[] {
    const set = this.rooms.get(roomId);
    if (!set) return [];
    const dedup = new Map<string, PresenceMember>();
    for (const client of set) {
      dedup.set(client.member.clinicianId, client.member);
    }
    return Array.from(dedup.values());
  }

  private broadcastPresence(roomId: string): void {
    this.broadcast(roomId, {
      type: 'presence:update',
      roomId,
      presence: this.getPresenceList(roomId),
    });
  }

  public broadcast(roomId: string, event: Record<string, unknown>): void {
    const set = this.rooms.get(roomId);
    if (!set) return;
    const serialized = JSON.stringify(event);
    for (const client of set) {
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.send(serialized);
      }
    }
  }

  private send(ws: WebSocket, event: Record<string, unknown>): void {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(event));
    }
  }
}

export const boardHub = new RealtimeBoardHub();
