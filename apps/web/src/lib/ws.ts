import type { ChatEvent } from '@noochi/shared';
import { useAuth } from './auth';

type Listener = (ev: ChatEvent, conversationId: string) => void;

class WsHub {
  private ws: WebSocket | null = null;
  private listeners = new Set<Listener>();
  private subs = new Set<string>();
  private retry = 0;

  connect() {
    const token = useAuth.getState().token;
    if (!token || this.ws) return;
    const proto = location.protocol === 'https:' ? 'wss' : 'ws';
    const ws = new WebSocket(`${proto}://${location.host}/ws?token=${encodeURIComponent(token)}`);
    this.ws = ws;
    ws.onopen = () => {
      this.retry = 0;
      for (const cid of this.subs) ws.send(JSON.stringify({ action: 'sub', conversationId: cid }));
    };
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data) as { kind: string; subject?: string; payload?: ChatEvent };
        if (msg.kind === 'event' && msg.subject?.startsWith('evt.chat.') && msg.payload) {
          const cid = msg.subject.split('.')[2];
          for (const l of this.listeners) l(msg.payload as ChatEvent, cid);
        }
      } catch { /* ignore */ }
    };
    ws.onclose = () => {
      if (this.ws !== ws) return; // stale socket, a newer one owns the slot
      this.ws = null;
      if (useAuth.getState().token) {
        const delay = Math.min(15000, 500 * 2 ** Math.min(this.retry++, 5));
        setTimeout(() => this.connect(), delay);
      }
    };
    ws.onerror = () => ws.close();
  }

  close() {
    const ws = this.ws;
    this.ws = null; // before close(): onclose sees no owner and won't reconnect
    ws?.close();
    this.subs.clear();
  }

  sub(conversationId: string) {
    this.subs.add(conversationId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'sub', conversationId }));
    } else this.connect();
  }

  unsub(conversationId: string) {
    this.subs.delete(conversationId);
    if (this.ws?.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({ action: 'unsub', conversationId }));
    }
  }

  on(l: Listener): () => void {
    this.listeners.add(l);
    return () => { this.listeners.delete(l); };
  }
}

export const wsHub = new WsHub();
// single module-level subscription — never subscribe per-connect, that fan-out caused a reconnect storm
useAuth.subscribe((s, prev) => {
  if (s.token === prev.token) return;
  if (!s.token) wsHub.close();
  else wsHub.connect();
});
