/**
 * Minimal ActionCable client for Chatwoot's RoomChannel (wss://<host>/cable).
 * Reconnects with backoff and pings presence so the agent shows as online.
 */
export type CableHandler = (event: string, data: any) => void;

export class ChatwootCable {
  private ws: WebSocket | null = null;
  private closed = false;
  private retry = 0;
  private presence: ReturnType<typeof setInterval> | undefined;
  private retryTimer: ReturnType<typeof setTimeout> | undefined;
  private identifier: string;
  connected = false;

  constructor(
    private url: string,
    ident: { pubsub_token: string; account_id: number; user_id: number },
    private onEvent: CableHandler,
    private onState: (connected: boolean, reconnected: boolean) => void,
  ) {
    this.identifier = JSON.stringify({ channel: 'RoomChannel', ...ident });
  }

  open() {
    this.closed = false;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onmessage = (ev) => {
      let msg: any;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.type === 'welcome') ws.send(JSON.stringify({ command: 'subscribe', identifier: this.identifier }));
      else if (msg.type === 'confirm_subscription') {
        const reconnected = this.retry > 0 || this.everConnected;
        this.everConnected = true;
        this.retry = 0; this.connected = true; this.onState(true, reconnected);
        this.sendPresence();
        clearInterval(this.presence);
        this.presence = setInterval(() => this.sendPresence(), 20_000);
      } else if (msg.type === 'reject_subscription') {
        ws.close();
      } else if (msg.type === 'disconnect') {
        ws.close();
      } else if (msg.message?.event) {
        this.onEvent(msg.message.event, msg.message.data);
      }
    };
    ws.onclose = () => {
      clearInterval(this.presence);
      if (this.connected) { this.connected = false; this.onState(false, false); }
      if (this.closed) return;
      const delay = Math.min(30_000, 1000 * 2 ** this.retry++);
      this.retryTimer = setTimeout(() => this.open(), delay);
    };
    ws.onerror = () => ws.close();
  }

  private everConnected = false;

  private sendPresence() {
    if (this.ws?.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ command: 'message', identifier: this.identifier, data: JSON.stringify({ action: 'update_presence' }) }));
  }

  close() {
    this.closed = true;
    clearInterval(this.presence);
    clearTimeout(this.retryTimer);
    this.ws?.close();
  }
}
