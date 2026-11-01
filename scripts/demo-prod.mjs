import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

console.log('[SkillSwap] Preparing Demo Environment (demo:reset)...');
const reset = spawnSync('npm', ['run', 'demo:reset'], {
  cwd: ROOT_DIR,
  stdio: 'inherit',
  shell: true,
});

if (reset.status !== 0) {
  console.error('Failed to reset demo data.');
  process.exit(reset.status || 1);
}

process.env.NODE_ENV = 'production';
process.env.DEMO_MODE = 'true';

console.log('[SkillSwap] Starting Production Server with DEMO_MODE=true...\n');
import('../server/src/index.js');
