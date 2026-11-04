import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));

const expectedBuild = 'vite build && node scripts/write-netlify-redirects.mjs';

test('production package is configured for Node 22', () => {
  const pkg = readJson('package.json');
  assert.equal(pkg.engines?.node, '22.x');
  assert.equal(pkg.packageManager, 'pnpm@10.30.3');
  assert.equal(pkg.private, true, 'the application must not be published as an npm package');
  assert.equal(pkg.scripts?.build, expectedBuild);
  assert.equal(pkg.scripts?.check, 'pnpm run build && pnpm test');
  assert.ok(fs.existsSync(path.join(root, 'pnpm-lock.yaml')));
  assert.ok(fs.existsSync(path.join(root, 'pnpm-workspace.yaml')));
});

test('deployment configuration is present', () => {
  const netlifyConfig = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8');
  assert.match(netlifyConfig, /command = "pnpm run build"/);
  assert.match(netlifyConfig, /NODE_VERSION = "22"/);
  assert.match(netlifyConfig, /command = "pnpm run dev:vite"/);
  assert.ok(fs.existsSync(path.join(root, 'netlify/functions/ai-coach.mjs')));
  assert.ok(fs.existsSync(path.join(root, 'netlify/functions/tournament-scan.mjs')));
  assert.ok(fs.existsSync(path.join(root, 'netlify/functions/tournament-scan-scheduled.mjs')));
});

test('core application files are present', () => {
  assert.ok(fs.existsSync(path.join(root, 'src/App.tsx')));
  assert.ok(fs.existsSync(path.join(root, 'src/types.ts')));
  assert.ok(fs.existsSync(path.join(root, 'src/lib')));
  assert.ok(fs.existsSync(path.join(root, 'src/services')));
});

test('security-sensitive repository hygiene is intact', () => {
  const envExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8');
  assert.ok(!/service_role/i.test(envExample), 'service_role must not be present in .env.example');
  assert.ok(fs.existsSync(path.join(root, 'SECURITY.md')));
});

test('automated maintenance watches both package managers and GitHub Actions', () => {
  const config = fs.readFileSync(path.join(root, '.github/dependabot.yml'), 'utf8');
  assert.match(config, /package-ecosystem: npm[\s\S]*directory: "\/"/);
  assert.match(config, /package-ecosystem: npm[\s\S]*directory: "\/AthleteN-Mobile"/);
  assert.match(config, /package-ecosystem: github-actions/);
});

test('scanner regression runs on pull requests without building a release APK', () => {
  const workflow = fs.readFileSync(path.join(root, '.github/workflows/android-apk.yml'), 'utf8');
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /pnpm install --frozen-lockfile --ignore-scripts/);
  assert.match(workflow, /if: github\.event_name != 'pull_request'/);
});
