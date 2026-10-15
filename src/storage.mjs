import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
export const alive = pid => {
  if (!Number.isInteger(pid) || pid <= 0) return false;
  try { process.kill(pid, 0); return true; } catch { return false; }
};
export function assertNoSymlinks(file) {
  let current = path.resolve(file);
  while (true) {
    if (fs.existsSync(current) && fs.lstatSync(current).isSymbolicLink()) {
      const systemAlias = process.platform === 'darwin' && ['/var', '/tmp', '/etc'].includes(current) &&
        fs.realpathSync(current) === `/private${current}`;
      if (!systemAlias) throw new Error('SYMLINK_PATH_REFUSED');
    }
    const parent = path.dirname(current);
    if (parent === current) return;
    current = parent;
  }
}
export function atomicJSON(file, value) {
  assertNoSymlinks(file);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${process.pid}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify(value, null, 2) + '\n', { mode: 0o600, flag: 'wx' });
    fs.renameSync(temporary, file);
  } finally { if (fs.existsSync(temporary)) fs.unlinkSync(temporary); }
}
export function readJSON(file, fallback) {
  try { return JSON.parse(fs.readFileSync(file, 'utf8')); }
  catch (error) { if (error.code === 'ENOENT') return fallback; throw new Error('INVALID_STATE_FILE'); }
}
export function acquireLock(directory) {
  assertNoSymlinks(directory);
  fs.mkdirSync(path.dirname(directory), { recursive: true, mode: 0o700 });
  try { fs.mkdirSync(directory, { mode: 0o700 }); }
  catch (error) {
    if (error.code !== 'EEXIST') throw error;
    const owner = readJSON(path.join(directory, 'owner.json'), null);
    if (!owner || alive(owner.pid)) throw new Error('LAUNCHER_ALREADY_RUNNING');
    fs.rmSync(directory, { recursive: true });
    fs.mkdirSync(directory, { mode: 0o700 });
  }
  const id = crypto.randomUUID();
  atomicJSON(path.join(directory, 'owner.json'), { pid: process.pid, id });
  return () => {
    if (readJSON(path.join(directory, 'owner.json'), null)?.id === id) fs.rmSync(directory, { recursive: true });
  };
}
