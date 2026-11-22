/* Isolated audit probes. No .env, network, database or application data access. */
/* eslint-disable @typescript-eslint/no-require-imports -- Standalone CommonJS probe with explicitly mocked module loading. */
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const ts = require('typescript');
const root = path.resolve(__dirname, '../..');
function load(file, mocks, env = {}) {
  const js = ts.transpileModule(fs.readFileSync(path.join(root, file), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true }
  }).outputText;
  const auditModule = { exports: {} };
  vm.runInNewContext(js, {
    module: auditModule, exports: auditModule.exports, Buffer, Date, Map, Promise, FormData,
    setTimeout, clearTimeout, console, process: { env },
    require: id => Object.hasOwn(mocks, id) ? mocks[id] : require(id)
  }, { filename: file });
  return auditModule.exports;
}
const redirect = target => { throw new Error('REDIRECT:' + target); };
async function main() {
  const argon = require('@node-rs/argon2');
  const h1 = await argon.hash('Audit-only-pass-123', { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  const h2 = await argon.hash('Audit-only-pass-123', { memoryCost: 19456, timeCost: 2, parallelism: 1 });
  assert.match(h1, /^\$argon2id\$v=19\$m=19456,t=2,p=1\$/);
  assert.notEqual(h1, h2);
  assert.equal(await argon.verify(h1, 'Audit-only-pass-123'), true);
  console.log('PASS: Argon2id parameters and random per-password salt');

  let sessions = 0, updates = 0, retained = null;
  const user = { id: 'fictional-staff', role: 'STAFF', mustChangePassword: false, passwordHash: 'mock', blockedAt: null, student: null };
  const tx = { user: { update: async () => { updates++; } }, session: { deleteMany: async q => { retained = q.where.id.not; } } };
  const mocks = {
    'next/navigation': { redirect },
    'next/headers': { cookies: async () => ({ get: () => ({ value: 'fictional-current-session' }) }) },
    '@/server/db': { prisma: { user: { findUnique: async () => user }, $transaction: async f => f(tx) } },
    '@/server/auth': { createSession: async () => { sessions++; }, homeFor: () => '/staff', userForPasswordChange: async () => user, verifyPassword: async () => false, hashPassword: async () => 'mock-new-hash' }
  };
  const actions = load('src/app/login/actions.ts', mocks);
  const demo = new FormData(); demo.set('login', 'dekanat');
  await assert.rejects(actions.demoLoginAction(demo), /REDIRECT:\/staff/);
  assert.equal(sessions, 1);
  const disabled = load('src/app/login/actions.ts', mocks, { DEMO_LOGIN: '0' });
  await assert.rejects(disabled.demoLoginAction(demo), /REDIRECT:\/login/);
  assert.equal(sessions, 1);
  console.log('CONFIRMED: missing DEMO_LOGIN allows passwordless staff login; explicit 0 blocks it');
  const change = new FormData(); change.set('password', 'Audit-only-new-123'); change.set('repeat', 'Audit-only-new-123');
  await assert.rejects(actions.changePasswordAction({}, change), /REDIRECT:\/staff/);
  assert.equal(updates, 1); assert.equal(retained, 'fictional-current-session');
  console.log('CONFIRMED: ordinary STAFF session changes password without old password; current session retained');

  let storedToken, cookieToken;
  const auth = load('src/server/auth.ts', {
    'server-only': {}, react: { cache: f => f },
    'next/navigation': { redirect },
    'next/headers': { headers: async () => new Map(), cookies: async () => ({ set: (_name, val) => { cookieToken = val; } }) },
    './db': { prisma: { session: { create: async q => { storedToken = q.data.id; } }, user: { update: async () => {} } } }
  });
  await auth.createSession('fictional-staff');
  assert.equal(storedToken, cookieToken);
  console.log('CONFIRMED: database Session.id equals bearer cookie token (value omitted)');

  let count = 29, bytes = 90 * 1024 * 1024;
  const docs = load('src/server/services/documents.ts', {
    'server-only': {},
    'node:fs/promises': { mkdir: async () => {}, writeFile: async () => {}, unlink: async () => {} },
    '../db': { prisma: { studentDocument: {
      aggregate: async () => ({ _count: { _all: count }, _sum: { size: bytes } }),
      create: async q => { count++; bytes += q.data.size; return q.data; }
    } } },
    '../files': { isWholePdf: () => true }, '../notify': {}, '../repos/staff': {},
    '@/config/services': { docKinds: { PASSPORT: { title: 'Fixture', expires: false } } },
    '@/lib/utils': { moscowToday: () => new Date() }
  });
  const file = { size: 6 * 1024 * 1024, arrayBuffer: async () => Buffer.alloc(6 * 1024 * 1024) };
  await Promise.all([docs.uploadDocument({ id: 'fixture' }, 'PASSPORT', file), docs.uploadDocument({ id: 'fixture' }, 'PASSPORT', file)]);
  assert.equal(count, 31); assert.equal(bytes, 102 * 1024 * 1024);
  console.log('CONFIRMED: concurrent document uploads exceed both 30-file and 100-MiB quotas');

  let relationFilter, gradeCreated = false;
  const teacher = load('src/server/repos/teacher.ts', {
    'server-only': {}, './attendance': {}, '../notify': { notify: async () => {} },
    '../db': { prisma: {
      enrollment: { findUnique: async () => ({ courseId: 'course', semester: 5, course: { name: 'Fixture' }, student: { userId: 'student-subgroup-2', groupId: 'group', course: 3 } }) },
      lesson: { count: async q => { relationFilter = q.where; return 1; } },
      grade: { create: async q => { gradeCreated = true; return q.data; } }
    } }
  });
  await teacher.addGrade({ id: 'teacher-subgroup-1' }, 'enrollment-subgroup-2', 10, 'Fixture');
  assert.equal(gradeCreated, true); assert.equal(relationFilter.subgroup, undefined);
  console.log('CONFIRMED: grade write checks group/course relation but no student subgroup');

  // Exercise the exact optional-directory shell loop on synthetic directories.
  const bash = 'C:/Program Files/Git/bin/bash.exe';
  if (fs.existsSync(bash)) {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'univer-audit-'));
    try {
      fs.mkdirSync(path.join(temp, 'uploads'));
      const shell = fs.readFileSync(path.join(root, 'deploy/backup.sh'), 'utf8');
      const command = shell.match(/sh -c '([^']+)'/)[1].replace('cd /app/data', 'cd "$AUDIT_FIXTURE"');
      const r = spawnSync(bash, ['-c', command], { env: { ...process.env, AUDIT_FIXTURE: temp.replaceAll('\\', '/') }, encoding: 'utf8' });
      assert.equal(r.stdout, 'uploads '); assert.equal(r.status, 1);
      const parent = spawnSync(bash, ['-c', 'set -euo pipefail; dirs="$(sh -c "$AUDIT_COMMAND")"; printf REACHED'], {
        env: { ...process.env, AUDIT_FIXTURE: temp.replaceAll('\\', '/'), AUDIT_COMMAND: command }, encoding: 'utf8'
      });
      assert.equal(parent.status, 1); assert.equal(parent.stdout, '');
      console.log('CONFIRMED: optional-directory discovery returns status 1 when photos is absent');
    } finally { fs.rmSync(temp, { recursive: true, force: true }); }
  } else console.log('SKIP: Bash unavailable');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
