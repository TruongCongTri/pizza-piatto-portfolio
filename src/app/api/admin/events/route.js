import { listen } from "@/lib/server/events";
import { errorResponse } from "@/lib/server/http";
import { getSession } from "@/lib/server/session";

export const dynamic = "force-dynamic";
/* a serverless function can't stay open for ever: the stream ends a bit
   before this and the desk's EventSource reconnects by itself */
export const maxDuration = 300;

const STREAM_MS = 280_000;
/* a comment line now and then keeps proxies from closing a quiet stream */
const HEARTBEAT_MS = 25_000;

const isStaff = (request) => getSession(request, "admin")?.role === "admin";

/* the staff desks' live line: a server-sent event "change" with the topic
   ("reservations" or "classes") each time a booking or class changes, so
   a desk reads its list only when there is something new */
export async function GET(request) {
  if (!isStaff(request)) return errorResponse(401, "signedOut");

  const encoder = new TextEncoder();
  const upstream = new AbortController();
  let closed = false;

  const stream = new ReadableStream({
    async start(controller) {
      const send = (text) => {
        if (!closed) controller.enqueue(encoder.encode(text));
      };
      const close = () => {
        if (closed) return;
        closed = true;
        clearInterval(heartbeat);
        clearTimeout(timer);
        upstream.abort();
        try {
          controller.close();
        } catch {
          /* already closed by the client */
        }
      };
      const heartbeat = setInterval(() => send(": still here\n\n"), HEARTBEAT_MS);
      const timer = setTimeout(close, STREAM_MS);
      request.signal.addEventListener("abort", close, { once: true });

      try {
        await listen((topic) => send(`event: change\ndata: ${topic}\n\n`), upstream.signal);
        /* reconnect after 2 s if the line drops; "ready" lets the desk
           catch up on anything it missed while it was away */
        send("retry: 2000\nevent: ready\ndata: ok\n\n");
      } catch (error) {
        console.error("[events] desk stream could not listen:", error);
        /* tell the desk to stop retrying fast; it still updates on focus */
        send("retry: 60000\nevent: unavailable\ndata: 1\n\n");
        close();
      }
    },
    cancel() {
      closed = true;
      upstream.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
