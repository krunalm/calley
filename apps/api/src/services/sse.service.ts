import { logger } from '../lib/logger';

// ─── Types ──────────────────────────────────────────────────────────

/** SSE event types emitted by the server */
export type SSEEventType =
  | 'event:created'
  | 'event:updated'
  | 'event:deleted'
  | 'task:created'
  | 'task:updated'
  | 'task:deleted'
  | 'reminder:fired'
  | 'category:updated'
  | 'category:deleted'
  | 'server-shutdown';

interface SSEConnection {
  controller: ReadableStreamDefaultController;
  createdAt: number;
}

// ─── Constants ──────────────────────────────────────────────────────

const HEARTBEAT_INTERVAL_MS = 30_000;
const MAX_CONNECTIONS_PER_USER = 5;

// ─── Service ────────────────────────────────────────────────────────

class SSEService {
  /** Map of userId → Set of SSE connections */
  private connections = new Map<string, Set<SSEConnection>>();

  /** Heartbeat timer */
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;

  constructor() {
    this.startHeartbeat();
  }

  /**
   * Add a new SSE connection for a user.
   * Enforces max connections per user; closes oldest on overflow.
   */
  addConnection(userId: string, controller: ReadableStreamDefaultController): SSEConnection {
    let userConnections = this.connections.get(userId);
    if (!userConnections) {
      userConnections = new Set();
      this.connections.set(userId, userConnections);
    }

    // Enforce max connections per user
    if (userConnections.size >= MAX_CONNECTIONS_PER_USER) {
      // Close the oldest connection
      let oldest: SSEConnection | null = null;
      for (const conn of userConnections) {
        if (!oldest || conn.createdAt < oldest.createdAt) {
          oldest = conn;
        }
      }
      if (oldest) {
        this.closeConnection(userId, oldest);
        logger.info({ userId }, 'Closed oldest SSE connection due to overflow');
      }
    }

    const connection: SSEConnection = {
      controller,
      createdAt: Date.now(),
    };

    userConnections.add(connection);
    logger.debug({ userId, count: userConnections.size }, 'SSE connection added');

    return connection;
  }

  /**
   * Remove an SSE connection for a user.
   */
  removeConnection(userId: string, connection: SSEConnection): void {
    const userConnections = this.connections.get(userId);
    if (!userConnections) return;

    userConnections.delete(connection);

    if (userConnections.size === 0) {
      this.connections.delete(userId);
    }

    logger.debug({ userId, count: userConnections?.size ?? 0 }, 'SSE connection removed');
  }

  /**
   * Emit an SSE event to all connections for a given user.
   */
  emit(userId: string, eventType: SSEEventType, data: unknown): void {
    const userConnections = this.connections.get(userId);
    if (!userConnections || userConnections.size === 0) return;

    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    const encoder = new TextEncoder();
    const encoded = encoder.encode(message);

    const dead: SSEConnection[] = [];

    for (const conn of userConnections) {
      try {
        conn.controller.enqueue(encoded);
      } catch {
        // Connection is dead — mark for removal
        dead.push(conn);
      }
    }

    // Clean up dead connections
    for (const conn of dead) {
      userConnections.delete(conn);
    }
    if (userConnections.size === 0) {
      this.connections.delete(userId);
    }
  }

  /**
   * Get the number of active connections (for monitoring).
   */
  getConnectionCount(): number {
    let total = 0;
    for (const conns of this.connections.values()) {
      total += conns.size;
    }
    return total;
  }

  /**
   * Close all SSE connections (called during graceful shutdown).
   */
  closeAll(): void {
    const encoder = new TextEncoder();
    const shutdownMsg = encoder.encode('event: server-shutdown\ndata: {}\n\n');

    for (const [, conns] of this.connections) {
      for (const conn of conns) {
        try {
          conn.controller.enqueue(shutdownMsg);
          conn.controller.close();
        } catch {
          // Ignore errors during shutdown
        }
      }
      conns.clear();
    }
    this.connections.clear();

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    logger.info('All SSE connections closed');
  }

  // ─── Private ──────────────────────────────────────────────────────

  /**
   * Close a single connection and try to send a close event.
   */
  private closeConnection(userId: string, connection: SSEConnection): void {
    try {
      connection.controller.close();
    } catch {
      // Already closed
    }
    const userConnections = this.connections.get(userId);
    if (userConnections) {
      userConnections.delete(connection);
      if (userConnections.size === 0) {
        this.connections.delete(userId);
      }
    }
  }

  /**
   * Send heartbeat comments to all connections every 30 seconds.
   * This keeps connections alive through proxies and load balancers.
   */
  private startHeartbeat(): void {
    this.heartbeatTimer = setInterval(() => {
      const encoder = new TextEncoder();
      const heartbeat = encoder.encode(':heartbeat\n\n');

      for (const [userId, conns] of this.connections) {
        const dead: SSEConnection[] = [];
        for (const conn of conns) {
          try {
            conn.controller.enqueue(heartbeat);
          } catch {
            dead.push(conn);
          }
        }
        for (const conn of dead) {
          conns.delete(conn);
        }
        if (conns.size === 0) {
          this.connections.delete(userId);
        }
      }
    }, HEARTBEAT_INTERVAL_MS);
  }
}

export const sseService = new SSEService();
