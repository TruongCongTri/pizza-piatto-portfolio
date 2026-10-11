import "server-only";

import { EventEmitter } from "node:events";

/* "Something changed" signals for the staff desks, so an open desk only
   reads the bookings again when there is something new, instead of asking
   every few seconds.

   With Upstash: every write to the bookings or classes already goes out
   as one pipeline that bumps a version; a PUBLISH rides along in it
   (changeCommand), and each open desk holds one subscription (Upstash's
   REST subscribe, a server-sent event stream) for as long as its
   connection lasts, so nothing is read while all is quiet. Without
   (local development, or one long-running server) an in-process event
   emitter does the same (announceLocally). */

const CHANNEL = "pp:desk";

const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const usingRedis = Boolean(REDIS_URL && REDIS_TOKEN);

/* shared by every route bundle in the process (and across dev reloads) */
const local = (globalThis.__pizzaPiattoEvents ??= new EventEmitter());
local.setMaxListeners(0);

/* the command to add to a write's pipeline: `topic` ("reservations" |
   "classes") changed */
export const changeCommand = (topic) => ["PUBLISH", CHANNEL, topic];

/* the same, for the file store */
export const announceLocally = (topic) => local.emit("change", topic);

/* calls `onChange(topic)` for each change until `signal` aborts; resolves
   once listening (rejects if the subscription can't be opened) */
export async function listen(onChange, signal) {
  if (!usingRedis) {
    local.on("change", onChange);
    signal.addEventListener("abort", () => local.off("change", onChange), { once: true });
    return;
  }

  const response = await fetch(`${REDIS_URL}/subscribe/${CHANNEL}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${REDIS_TOKEN}`,
      Accept: "text/event-stream",
      "Cache-Control": "no-cache",
    },
    body: "[]",
    cache: "no-store",
    signal,
  });
  if (!response.ok || !response.body) {
    throw new Error(`Redis subscribe failed with ${response.status}`);
  }

  /* lines look like "data: message,pp:desk,reservations" */
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  (async () => {
    let buffer = "";
    try {
      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data: message,")) continue;
          const rest = line.slice("data: message,".length);
          onChange(rest.slice(rest.indexOf(",") + 1).trim());
        }
      }
    } catch (error) {
      if (error.name !== "AbortError") console.error("[events] subscription ended:", error);
    }
  })();
}
