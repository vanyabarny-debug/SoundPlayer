import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';

const endpoint = 'http://127.0.0.1:7256/ingest/59c4ea1f-4267-4a06-ab6d-96fcc05a4b36';

function sendLog(hypothesisId, location, message, data) {
  // #region agent log
  fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Debug-Session-Id': '7eb8ef',
    },
    body: JSON.stringify({
      sessionId: '7eb8ef',
      runId: 'pre-fix',
      hypothesisId,
      location,
      message,
      data,
      timestamp: Date.now(),
    }),
  }).catch(() => {});
  // #endregion
}

const cwd = process.cwd();
const wranglerTomlPath = path.join(cwd, 'wrangler.toml');
const wranglerJsoncPath = path.join(cwd, 'wrangler.jsonc');
const distPath = path.join(cwd, 'dist');

sendLog('H1', 'scripts/cf-deploy-diagnose.mjs:33', 'Wrangler config presence', {
  cwd,
  wranglerTomlExists: existsSync(wranglerTomlPath),
  wranglerJsoncExists: existsSync(wranglerJsoncPath),
});

sendLog('H2', 'scripts/cf-deploy-diagnose.mjs:39', 'Static assets directory presence', {
  distExists: existsSync(distPath),
});

const dryRun = spawnSync('npx', ['wrangler', 'deploy', '--dry-run'], {
  cwd,
  encoding: 'utf8',
});

sendLog('H3', 'scripts/cf-deploy-diagnose.mjs:48', 'Wrangler dry-run exit code', {
  status: dryRun.status,
  signal: dryRun.signal,
});

sendLog('H4', 'scripts/cf-deploy-diagnose.mjs:54', 'Wrangler dry-run stderr snippet', {
  stderr: (dryRun.stderr || '').slice(0, 1200),
});

sendLog('H5', 'scripts/cf-deploy-diagnose.mjs:58', 'Wrangler dry-run stdout snippet', {
  stdout: (dryRun.stdout || '').slice(0, 1200),
});

if (dryRun.stdout) process.stdout.write(dryRun.stdout);
if (dryRun.stderr) process.stderr.write(dryRun.stderr);
process.exit(dryRun.status ?? 1);
