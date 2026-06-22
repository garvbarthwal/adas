/**
 * Reconnecting WebSocket client.
 *
 * Used independently for each channel (`/ws/detections`, `/ws/metrics`) so the
 * two streams never interfere. Handles exponential backoff reconnection and
 * surfaces connection-state transitions to the UI.
 */

import type { ConnectionState } from "@/types";

export interface ReconnectingSocketOptions<T> {
  url: string;
  onMessage: (data: T) => void;
  onStateChange?: (state: ConnectionState) => void;
  /** Initial backoff in ms (doubles up to maxBackoff). */
  baseBackoff?: number;
  maxBackoff?: number;
}

export class ReconnectingSocket<T> {
  private ws: WebSocket | null = null;
  private closedByUser = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly opts: ReconnectingSocketOptions<T>) {}

  connect(): void {
    this.closedByUser = false;
    this.open();
  }

  private open(): void {
    this.opts.onStateChange?.("connecting");
    const ws = new WebSocket(this.opts.url);
    this.ws = ws;

    ws.onopen = () => {
      this.attempt = 0;
      this.opts.onStateChange?.("open");
    };

    ws.onmessage = (event) => {
      try {
        this.opts.onMessage(JSON.parse(event.data) as T);
      } catch {
        // Ignore malformed frames rather than crashing the channel.
      }
    };

    ws.onclose = () => {
      this.opts.onStateChange?.("closed");
      if (!this.closedByUser) this.scheduleReconnect();
    };

    ws.onerror = () => {
      // The browser fires `close` after `error`; reconnect handled there.
      ws.close();
    };
  }

  private scheduleReconnect(): void {
    const base = this.opts.baseBackoff ?? 500;
    const max = this.opts.maxBackoff ?? 10_000;
    const delay = Math.min(max, base * 2 ** this.attempt);
    this.attempt += 1;
    this.timer = setTimeout(() => this.open(), delay);
  }

  close(): void {
    this.closedByUser = true;
    if (this.timer) clearTimeout(this.timer);
    this.ws?.close();
    this.ws = null;
  }
}
