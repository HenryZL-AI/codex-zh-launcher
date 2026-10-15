import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root, releaseFiles, checkRelease} from './check-release.mjs';

checkRelease();
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json')));
const directory = `codex-zh-launcher-${pkg.version}`;
const output = path.resolve(process.argv[2] ?? path.join(root, 'dist'));
fs.mkdirSync(output, { recursive: true });
const stage = fs.mkdtempSync(path.join(os.tmpdir(), 'codex-zh-release-'));
try {
  for (const relative of releaseFiles()) {
    const dest = path.join(stage, directory, relative);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(path.join(root, relative), dest);
  }
  const file = path.join(output, `${directory}-source.tar.gz`);
  if (fs.existsSync(file)) throw new Error('Release file already exists; preserve it or choose a new directory');
  execFileSync('/usr/bin/tar', ['-czf', file, '-C', stage, directory], { stdio: 'pipe', env: { ...process.env, COPYFILE_DISABLE: '1' } });
  const checksum = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
  fs.writeFileSync(path.join(output, 'SHA256SUMS'), `${checksum}  ${path.basename(file)}\n`);
  console.log(JSON.stringify({ file, sha256: checksum, sourceFiles: releaseFiles().length }, null, 2));
} finally { fs.rmSync(stage, { recursive: true, force: true }); }
