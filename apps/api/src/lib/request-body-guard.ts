import { createServer } from 'node:http';

import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Streaming enforcement of the request-body limit at the HTTP server layer.
 *
 * The `bodyLimit` middleware rejects oversized bodies cheaply, but only when a
 * trustworthy `Content-Length` is present. A chunked request carries no such
 * header, so the middleware waved it through and the JSON parser happily
 * buffered an unbounded body. This guard counts incoming bytes on the *socket*
 * and cuts the connection at the limit — Content-Length or not.
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
 * Counting happens on the socket, deliberately: an earlier attempt counted on
 * the request stream by attaching a `data` listener and immediately pausing.
 * That stalls real requests — the framework's own consumers race the pause,
 * and bodies stop flowing through @hono/node-server, so every POST times out.
 * Socket bytes, by contrast, flow past every listener on the way to the HTTP
 * parser: counting them never consumes anything the framework still needs to
 * read.
 *
 * Two consequences of the socket choice, both accepted for a DoS backstop:
 *
 * - Bytes that arrive in the same TCP segment as the request line/headers may
 *   have passed before the `request` event fires and the counter attaches, so
 *   the count can run low by at most one segment (~64KB). Precise enforcement
 *   stays with the Content-Length middleware; what this guard must catch is a
 *   chunked upload streaming far past the limit, which spans many segments
 *   and cannot hide in one.
 * - The socket is shared across keep-alive requests, so the listener is
 *   removed as soon as the response finishes or the socket closes; a stale
 *   counter must never bleed into the next request.
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

    const socket = req.socket;
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
          res.end(payloadTooLargeBody(maxBytes), () => socket.destroy());
        } else {
          // A response is already underway — nothing to do but drop the
          // connection before more of the body lands.
          socket.destroy();
        }
      }
    };

    const cleanup = () => {
      socket.off('data', onData);
      socket.off('close', cleanup);
      res.off('finish', cleanup);
    };

    socket.on('data', onData);
    socket.on('close', cleanup);
    res.on('finish', cleanup);

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
