import { createServer } from 'node:http';

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Streaming enforcement of the request-body limit at the HTTP server layer.
 *
 * The `bodyLimit` middleware rejects oversized bodies cheaply, but only when a
 * trustworthy `Content-Length` is present. A chunked request carries no such
 * header, so the middleware waved it through and the JSON parser happily
 * buffered an unbounded body. This guard counts the bytes as the body is
 * consumed and cuts the request at the limit — Content-Length or not.
 */
export const MAX_STREAMING_BODY_BYTES = 1024 * 1024; // 1MB — matches the middleware

interface BodyLimitJson {
  error: { code: string; message: string };
}

function payloadTooLargeBody(maxBytes: number): string {
  const body: BodyLimitJson = {
    error: {
      code: 'PAYLOAD_TOO_LARGE',
      message: `Request body must not exceed ${Math.round(maxBytes / 1024)}KB`,
    },
  };
  return JSON.stringify(body);
}

/**
 * Wrap a Node request listener so that requests whose body exceeds `maxBytes`
 * are answered with 413 and the connection is dropped.
 *
 * Counting attaches a `data` listener and immediately pauses the stream: the
 * pause prevents any chunk from flowing before the framework attaches its own
 * consumer, and when the framework reads, flow resumes and every chunk is
 * broadcast to this listener as well — so the count observes the body without
 * consuming it. (Counting on the socket instead would miss whatever the HTTP
 * parser has already buffered; patching `read()` misses whatever the framework
 * drains through the internal buffer.)
 *
 * Bodyless methods pass through untouched — and SSE rides on GET, which must
 * never be counted or cut.
 */
export function createBodyLimitListener(
  listener: (req: IncomingMessage, res: ServerResponse) => void,
  maxBytes: number,
): (req: IncomingMessage, res: ServerResponse) => void {
  return (req, res) => {
    const method = req.method?.toUpperCase();

    if (!method || method === 'GET' || method === 'HEAD' || method === 'OPTIONS') {
      listener(req, res);
      return;
    }

    let received = 0;
    let rejected = false;

    const onData = (chunk: Buffer) => {
      received += chunk.length;
      if (!rejected && received > maxBytes) {
        rejected = true;
        if (!res.headersSent && !res.writableEnded) {
          res.writeHead(413, {
            'Content-Type': 'application/json',
            Connection: 'close',
          });
          res.end(payloadTooLargeBody(maxBytes), () => req.socket.destroy());
        } else {
          // A response is already underway — nothing to do but drop the
          // connection before more of the body lands.
          req.socket.destroy();
        }
      }
    };

    req.on('data', onData);
    // Synchronous: the stream switches to flowing mode on the next tick, and
    // pausing now means no chunk is emitted before the framework reads.
    req.pause();

    listener(req, res);
  };
}

/**
 * A `createServer` replacement for `@hono/node-server`'s `serve()` that
 * enforces the streaming body limit on every request.
 */
export function createBodyLimitingServer(maxBytes: number = MAX_STREAMING_BODY_BYTES) {
  return ((options, requestListener) =>
    createServer(
      options,
      createBodyLimitListener(
        requestListener as (req: IncomingMessage, res: ServerResponse) => void,
        maxBytes,
      ),
    )) as typeof createServer;
}
