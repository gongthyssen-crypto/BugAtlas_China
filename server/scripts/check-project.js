import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const serverDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const workspaceDir = path.resolve(serverDir, '..');

function filesUnder(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) return filesUnder(target);
    return [target];
  });
}

const codeFiles = [...filesUnder(path.join(serverDir, 'src')), ...filesUnder(path.join(workspaceDir, 'miniprogram'))]
  .filter(file => file.endsWith('.js'));
for (const file of codeFiles) execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });

const jsonFiles = [path.join(workspaceDir, 'project.config.json'), ...filesUnder(path.join(workspaceDir, 'miniprogram')).filter(file => file.endsWith('.json'))];
for (const file of jsonFiles) JSON.parse(fs.readFileSync(file, 'utf8'));

const appConfig = JSON.parse(fs.readFileSync(path.join(workspaceDir, 'miniprogram', 'app.json'), 'utf8'));
for (const page of appConfig.pages) {
  for (const extension of ['.js', '.json', '.wxml', '.wxss']) {
    const file = path.join(workspaceDir, 'miniprogram', `${page}${extension}`);
    if (!fs.existsSync(file)) throw new Error(`Missing miniprogram page file: ${file}`);
  }
}
console.log(`Checked ${codeFiles.length} JavaScript files, ${jsonFiles.length} JSON files and ${appConfig.pages.length} miniprogram pages.`);
