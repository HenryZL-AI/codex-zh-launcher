import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFileSync} from 'node:child_process';

export const root = fileURLToPath(new URL('../', import.meta.url));
export const releaseEntries = ['bin', 'src', 'scripts', 'test', 'docs', '.github',
  'package.json', 'pnpm-lock.yaml', '.gitignore', 'LICENSE', 'NOTICE', 'README.md', 'README.en.md', 'CHANGELOG.md', 'CONTRIBUTING.md'];
export function releaseFiles(base = root) {
  const files = [];
  function walk(relative) {
    const file = path.join(base, relative), stat = fs.lstatSync(file);
    if (stat.isSymbolicLink()) throw new Error(`Release symlink refused: ${relative}`);
    if (stat.isDirectory()) for (const name of fs.readdirSync(file).sort()) walk(path.join(relative, name));
    else if (stat.isFile()) files.push(relative);
    else throw new Error(`Unsupported release entry: ${relative}`);
  }
  for (const entry of releaseEntries) walk(entry);
  return files;
}
export function checkRelease(base = root) {
  const files = releaseFiles(base);
  for (const relative of files) {
    if (/\.(png|jpg|sqlite|asar|scpt|dmg|zip|tgz|log)$/i.test(relative) || /(^|\/)(node_modules|auth\.json|config\.toml|status\.json)(\/|$)/.test(relative)) {
      throw new Error(`Private or binary release entry: ${relative}`);
    }
    const text = fs.readFileSync(path.join(base, relative), 'utf8');
    if (/\/Users\/[^\s'"/]+\//.test(text) || /(?:sk-[a-zA-Z0-9]{20,}|Bearer\s+[a-zA-Z0-9._-]{20,})/.test(text) ||
        /[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}/i.test(text)) {
      throw new Error(`Potential private path, credential or session ID: ${relative}`);
    }
    if (relative.endsWith('.mjs') || relative.endsWith('.js')) execFileSync(process.execPath, ['--check', path.join(base, relative)], { stdio: 'pipe' });
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(base, 'package.json')));
  if (pkg.license !== 'MIT' || pkg.dependencies['@electron/asar'] !== '4.2.0') throw new Error('Release metadata mismatch');
  return { passed: true, files: files.length, license: pkg.license, personalPaths: 0, credentialPatterns: 0, binaryAssets: 0 };
}
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) console.log(JSON.stringify(checkRelease(), null, 2));
