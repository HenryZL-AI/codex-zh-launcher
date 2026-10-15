import {EventEmitter} from 'node:events';

export class PrivatePipe extends EventEmitter {
  constructor(child) {
    super(); this.child = child; this.id = 0; this.buffer = ''; this.pending = new Map(); this.closed = false;
    child.stdio[4].on('data', data => {
      this.buffer += data.toString();
      let offset;
      while ((offset = this.buffer.indexOf('\0')) >= 0) {
        const part = this.buffer.slice(0, offset); this.buffer = this.buffer.slice(offset + 1);
        if (!part) continue;
        let message; try { message = JSON.parse(part); } catch { continue; }
        if (message.id) {
          const request = this.pending.get(message.id); if (!request) continue;
          this.pending.delete(message.id); clearTimeout(request.timer);
          message.error ? request.reject(new Error(`CDP_ERROR:${request.method}`)) : request.resolve(message.result);
        } else this.emit('event', message);
      }
    });
    child.stdio[3].on('error', () => this.stop());
    child.once('exit', () => this.stop());
    child.once('error', () => this.stop());
  }
  call(method, params = {}, sessionId) {
    if (this.closed) return Promise.reject(new Error('APP_EXITED'));
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`CDP_TIMEOUT:${method}`)); }, 10000);
      this.pending.set(id, { resolve, reject, timer, method });
      this.child.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
    });
  }
  stop() {
    if (this.closed) return;
    this.closed = true;
    for (const request of this.pending.values()) { clearTimeout(request.timer); request.reject(new Error('APP_EXITED')); }
    this.pending.clear(); this.emit('closed');
  }
}
