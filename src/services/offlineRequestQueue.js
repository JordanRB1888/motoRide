const STORAGE_KEY = '58express_offline_requests_v1';

function readQueue() {
  try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
  catch { return []; }
}

function writeQueue(items) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
}

export const offlineRequestQueue = {
  enqueue(request) {
    const queue = readQueue();
    if (!queue.some(item => item.idempotencyKey === request.idempotencyKey)) {
      queue.push({ ...request, queuedAt: new Date().toISOString(), attempts: 0 });
      writeQueue(queue);
    }
  },

  async flush(send) {
    const pending = readQueue();
    const remaining = [];
    for (const request of pending) {
      try {
        const sent = await send(request);
        if (!sent) remaining.push({ ...request, attempts: request.attempts + 1 });
      } catch {
        remaining.push({ ...request, attempts: request.attempts + 1 });
      }
    }
    writeQueue(remaining);
    return { sent: pending.length - remaining.length, pending: remaining.length };
  },

  size() { return readQueue().length; }
};
