import { createServer, request, type Server } from 'node:http';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createBodyLimitListener } from '../request-body-guard';

/**
 * The Content-Length middleware cannot see chunked uploads, so the limit has to
 * be enforced while the body streams in. These tests run a real localhost
 * server because the whole point is socket-level behaviour.
 */
describe('createBodyLimitListener', () => {
  const LIMIT = 2048; // 2KB for tests
  let server: Server;
  let baseUrl: string;

  beforeEach(async () => {
    server = createServer(
      createBodyLimitListener((req, res) => {
        // Consume the body before answering, like a real JSON handler does —
        // otherwise the response wins the race before the counter trips. The
        // guard may have already responded (413) by the time the request ends,
        // in which case this handler must not write again.
        req.resume();
        req.on('end', () => {
          if (res.writableEnded || res.headersSent) return;
          res.writeHead(200, { 'Content-Type': 'text/plain' });
          res.end('ok');
        });
      }, LIMIT),
    );
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const address = server.address();
    if (typeof address === 'object' && address) {
      baseUrl = `http://127.0.0.1:${address.port}`;
    } else {
      throw new Error('Could not determine test server port');
    }
  });

  afterEach(async () => {
    server.closeAllConnections?.();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  type Outcome = { kind: 'response'; status: number; body: string } | { kind: 'reset' };

  /**
   * Send a POST in two writes without Content-Length — Node frames it as
   * chunked, which is exactly the encoding the middleware's header check
   * cannot see.
   */
  function postChunked(body: string): Promise<Outcome> {
    return new Promise((resolve, reject) => {
      const req = request(
        baseUrl,
        { method: 'POST', headers: { 'Transfer-Encoding': 'chunked' } },
        (res) => {
          let data = '';
          res.on('data', (chunk: Buffer) => (data += chunk.toString()));
          res.on('end', () =>
            resolve({ kind: 'response', status: res.statusCode ?? 0, body: data }),
          );
        },
      );
      req.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNRESET') resolve({ kind: 'reset' });
        else reject(err);
      });
      const mid = Math.floor(body.length / 2);
      req.write(body.slice(0, mid));
      req.write(body.slice(mid));
      req.end();
    });
  }

  it('lets a small chunked body through untouched', async () => {
    const outcome = await postChunked('x'.repeat(512));

    expect(outcome.kind).toBe('response');
    if (outcome.kind === 'response') expect(outcome.status).toBe(200);
  });

  it('rejects a chunked body that exceeds the limit', async () => {
    const outcome = await postChunked('x'.repeat(LIMIT + 4096));

    // Either the 413 response wins the race with the client's remaining
    // writes, or the connection is cut mid-upload — both prove the streaming
    // limit engaged. What must NOT happen is the body being accepted.
    if (outcome.kind === 'response') {
      expect(outcome.status).toBe(413);
      expect(outcome.body).toContain('PAYLOAD_TOO_LARGE');
    } else {
      expect(outcome.kind).toBe('reset');
    }
  });

  it('rejects a Content-Length body that exceeds the limit', async () => {
    const outcome = await new Promise<Outcome>((resolve, reject) => {
      const req = request(baseUrl, { method: 'POST' }, (res) => {
        let data = '';
        res.on('data', (chunk: Buffer) => (data += chunk.toString()));
        res.on('end', () => resolve({ kind: 'response', status: res.statusCode ?? 0, body: data }));
      });
      req.on('error', (err: NodeJS.ErrnoException) => {
        if (err.code === 'ECONNRESET') resolve({ kind: 'reset' });
        else reject(err);
      });
      req.end('x'.repeat(LIMIT + 4096));
    });

    if (outcome.kind === 'response') {
      expect(outcome.status).toBe(413);
      expect(outcome.body).toContain('PAYLOAD_TOO_LARGE');
    } else {
      expect(outcome.kind).toBe('reset');
    }
  });

  it('does not interfere with GET requests', async () => {
    const outcome = await new Promise<Outcome>((resolve, reject) => {
      const req = request(baseUrl, { method: 'GET' }, (res) => {
        res.resume();
        res.on('end', () => resolve({ kind: 'response', status: res.statusCode ?? 0, body: '' }));
      });
      req.on('error', reject);
      req.end();
    });

    expect(outcome.kind).toBe('response');
    if (outcome.kind === 'response') expect(outcome.status).toBe(200);
  });
});
