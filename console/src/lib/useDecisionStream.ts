import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import type { StreamDecisionEvent } from "../api/types";

export interface StreamRow extends StreamDecisionEvent {
  /** client-assigned, used as React key + to drive the new-row flash */
  _id: string;
  _fresh: boolean;
}

export type StreamConnState = "connecting" | "open" | "error";

const MAX_ROWS = 500;
// EventSource has no built-in timeout for a connection stuck in CONNECTING (readyState 0)
// with no response yet — the browser's native auto-reconnect only fires from an explicit
// `onerror`, which a hung handshake never triggers. A watchdog that recycles the connection
// if it hasn't opened within this window turns a silent stall into a real reconnect attempt.
const CONNECT_WATCHDOG_MS = 4000;

/** Subscribes to GET /v1/stream (SSE) for the lifetime of the component. Never invents
 * rows — connection state is surfaced so the UI can show a real error/empty state instead
 * of silently looking idle. */
export function useDecisionStream() {
  const [rows, setRows] = useState<StreamRow[]>([]);
  const [connState, setConnState] = useState<StreamConnState>("connecting");
  const seenIds = useRef(new Set<string>());

  useEffect(() => {
    let es: EventSource;
    let watchdog: number;
    let cancelled = false;

    function connect() {
      es = new EventSource(api.streamUrl());
      setConnState((prev) => (prev === "open" ? prev : "connecting"));

      watchdog = window.setTimeout(() => {
        if (es.readyState === EventSource.CONNECTING) {
          es.close();
          if (!cancelled) connect(); // still stuck — recycle rather than wait forever
        }
      }, CONNECT_WATCHDOG_MS);

      es.onopen = () => {
        window.clearTimeout(watchdog);
        setConnState("open");
      };
      es.onerror = () => {
        window.clearTimeout(watchdog);
        setConnState("error");
      };

      es.addEventListener("decision", (evt) => {
        setConnState("open");
        try {
          const data = JSON.parse((evt as MessageEvent).data) as StreamDecisionEvent;
          const id = `${data.end_to_end_id}-${data.decided_at_ms}`;
          if (seenIds.current.has(id)) return;
          seenIds.current.add(id);
          setRows((prev) => {
            const next = [{ ...data, _id: id, _fresh: true }, ...prev];
            return next.slice(0, MAX_ROWS);
          });
          // clear the "fresh" flag after the flash duration so re-renders don't re-flash
          window.setTimeout(() => {
            setRows((prev) => prev.map((r) => (r._id === id ? { ...r, _fresh: false } : r)));
          }, 450);
        } catch {
          // malformed payload from the backend — drop it, don't crash the table
        }
      });
    }

    connect();
    return () => {
      cancelled = true;
      window.clearTimeout(watchdog);
      es.close();
    };
  }, []);

  return { rows, connState };
}
