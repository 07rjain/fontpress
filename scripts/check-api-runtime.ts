import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { mkdtemp, rm, symlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { promisify } from 'node:util';
import ts from 'typescript';

// TSX/Vite resolve extensionless imports that native Node ESM rejects on Vercel.
// Emit the API's actual import graph and exercise it with plain Node, without a TS loader.
const root = resolve('.');
const output = await mkdtemp(join(tmpdir(), 'handpress-api-runtime-'));
try {
  const config = ts.readConfigFile(join(root, 'tsconfig.json'), ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
  const program = ts.createProgram([join(root, 'api/index.ts')], {
    ...parsed.options, noEmit: false, rootDir: root, outDir: output, sourceMap: false,
  });
  const diagnostics = ts.getPreEmitDiagnostics(program);
  assert.equal(diagnostics.length, 0, ts.formatDiagnosticsWithColorAndContext(diagnostics, {
    getCurrentDirectory: () => root, getCanonicalFileName: (name) => name, getNewLine: () => '\n',
  }));
  assert.equal(program.emit().emitSkipped, false, 'The API must compile to JavaScript.');
  await writeFile(join(output, 'package.json'), JSON.stringify({ type: 'module' }));
  await symlink(join(root, 'node_modules'), join(output, 'node_modules'), 'dir');
  const source = `
    import assert from 'node:assert/strict';
    import { createServer } from 'node:http';
    import { existsSync } from 'node:fs';
    import handler from './api/index.js';
    const server = createServer(handler);
    await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
    try {
      const origin = 'http://127.0.0.1:' + server.address().port;
      for (const [path, status] of [['/api/unknown', 404], ['/api/fonts/mine', 401], ['/api/health', 503]]) {
        const response = await fetch(origin + path);
        assert.equal(response.status, status, path);
        assert(response.headers.get('content-type').includes('application/json'), path + ' must return JSON.');
        await response.json();
      }
      assert.equal(existsSync(process.env.DATA_DIR), false, 'Vercel must never initialize SQLite.');
      console.log('Compiled API runtime passed: native ESM loads, nested routes work, private routes reject anonymous access, and missing cloud config fails safely.');
    } finally { await new Promise(resolve => server.close(resolve)); }
  `;
  await writeFile(join(output, 'check.mjs'), source);
  const { stdout } = await promisify(execFile)(process.execPath, ['check.mjs'], {
    cwd: output, timeout: 30_000,
    env: { ...process.env, VERCEL: '1', SUPABASE_URL: '', SUPABASE_SECRET_KEY: '', CLERK_SECRET_KEY: '', DATA_DIR: join(output, 'must-not-exist') },
  });
  console.log(stdout.trim());
} finally { await rm(output, { recursive: true, force: true }); }
