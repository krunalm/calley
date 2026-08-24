import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../lib/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

import { MAX_QUEUE_BACKLOG_BYTES, sseService } from '../sse.service';

const USER = 'user-1';

/**
 * A stream built exactly as `stream.routes.ts` builds it: byte-counting
 * queuing strategy, so `desiredSize` reports remaining headroom in bytes.
 *
 * The strategy is not incidental. Under the default strategy `desiredSize`
 * counts *chunks* against a high-water mark of 1, so a byte-valued backlog
 * threshold could never be reached and the guard below would be dead code.
 */
function makeStream() {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const stream = new ReadableStream<Uint8Array>(
    { start: (c) => void (controller = c) },
    new ByteLengthQueuingStrategy({ highWaterMark: MAX_QUEUE_BACKLOG_BYTES }),
  );
  return { stream, controller };
}

describe('SSEService', () => {
  beforeEach(() => {
    sseService.closeAll();
  });

  it('registers and releases a connection', () => {
    const { controller } = makeStream();

    const conn = sseService.addConnection(USER, controller);
    expect(conn).not.toBeNull();
    expect(sseService.getConnectionCount()).toBe(1);

    sseService.removeConnection(USER, conn!);
    expect(sseService.getConnectionCount()).toBe(0);
  });

  it('delivers an event to every connection the user holds', async () => {
    const first = makeStream();
    const second = makeStream();
    sseService.addConnection(USER, first.controller);
    sseService.addConnection(USER, second.controller);

    sseService.emit(USER, 'event:created', { id: 'evt_1' });

    for (const { stream } of [first, second]) {
      const { value } = await stream.getReader().read();
      const text = new TextDecoder().decode(value);
      expect(text).toContain('event: event:created');
      expect(text).toContain('"id":"evt_1"');
    }
  });

  it('does not deliver one user’s events to another', async () => {
    const mine = makeStream();
    const theirs = makeStream();
    sseService.addConnection(USER, mine.controller);
    sseService.addConnection('user-2', theirs.controller);

    sseService.emit(USER, 'event:created', { id: 'evt_1' });

    expect(theirs.controller.desiredSize).toBe(MAX_QUEUE_BACKLOG_BYTES);
  });

  it('closes the oldest connection when a user exceeds the per-user cap', () => {
    for (let i = 0; i < 6; i++) {
      sseService.addConnection(USER, makeStream().controller);
    }

    expect(sseService.getConnectionCount()).toBe(5);
  });

  /**
   * `enqueue` never rejects on a slow consumer — it buffers, bounded only by
   * memory. A client that stops reading would otherwise accumulate every event
   * its account generates for as long as the socket stays half-open.
   */
  it('drops a connection whose queue has stopped draining', () => {
    const { controller } = makeStream();
    sseService.addConnection(USER, controller);

    // Nothing reads this stream, so the queue only grows.
    const payload = { id: 'evt', filler: 'x'.repeat(64 * 1024) };
    for (let i = 0; i < 32; i++) {
      sseService.emit(USER, 'event:created', payload);
    }

    expect(sseService.getConnectionCount()).toBe(0);
  });

  it('keeps delivering to a connection that is being read', async () => {
    const { stream, controller } = makeStream();
    sseService.addConnection(USER, controller);
    const reader = stream.getReader();

    for (let i = 0; i < 32; i++) {
      sseService.emit(USER, 'event:created', { id: `evt_${i}` });
      await reader.read();
    }

    expect(sseService.getConnectionCount()).toBe(1);
  });

  it('closes every connection on shutdown', () => {
    sseService.addConnection(USER, makeStream().controller);
    sseService.addConnection('user-2', makeStream().controller);

    sseService.closeAll();

    expect(sseService.getConnectionCount()).toBe(0);
  });

  it('ignores an emit for a user with no connections', () => {
    expect(() => sseService.emit('nobody', 'event:created', { id: 'x' })).not.toThrow();
  });
});
