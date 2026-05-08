/**
 * JERVIS · HOLODECK DOCKER EXECUTOR
 * Real VM-grade isolation via `docker run --rm`.
 * Falls back gracefully if Docker daemon not running.
 *
 * Image presets (pulled on first use):
 *   node : node:22-alpine       (~50MB, has node + npm)
 *   bash : alpine:3.20          (~5MB, has bash + busybox)
 *   py   : python:3.12-alpine   (~50MB)
 *
 * Hard constraints per run:
 *   --rm                       : container deleted after exit
 *   --network none             : no internet
 *   --memory 256m              : 256 MB RAM cap
 *   --cpus 0.5                 : half a vCPU
 *   --pids-limit 64            : fork bomb guard
 *   --read-only                : root FS read-only (tmpfs for /tmp)
 *   --cap-drop ALL             : no Linux capabilities
 *   --security-opt no-new-privileges
 *   timeout (host-side)        : kill if exceeds budget
 */

import { spawn, execFile } from 'node:child_process';

const IMAGES = {
  node: 'node:22-alpine',
  bash: 'alpine:3.20',
  py:   'python:3.12-alpine',
};

const RUN_CMD = {
  node: ['node', '-e'],
  bash: ['sh',   '-c'],
  py:   ['python', '-c'],
};

let _dockerAvailable = null;
let _imagesPulled = new Set();

export async function dockerAvailable() {
  if (_dockerAvailable !== null) return _dockerAvailable;
  return new Promise(res => {
    execFile('docker', ['version', '--format', '{{.Server.Version}}'], { timeout: 2000 }, (err, stdout) => {
      _dockerAvailable = !err && !!stdout.trim();
      res(_dockerAvailable);
    });
  });
}

async function ensureImage(image) {
  if (_imagesPulled.has(image)) return;
  return new Promise((res, rej) => {
    execFile('docker', ['image', 'inspect', image], { timeout: 3000 }, (err) => {
      if (!err) { _imagesPulled.add(image); return res(); }
      // pull
      const p = spawn('docker', ['pull', image], { stdio: 'ignore' });
      p.on('close', code => {
        if (code === 0) { _imagesPulled.add(image); res(); }
        else rej(new Error(`docker pull ${image} failed (exit ${code})`));
      });
    });
  });
}

export async function runInDocker({ lang, code, timeoutMs = 8000 }) {
  if (!IMAGES[lang]) throw new Error(`unsupported lang: ${lang}`);
  if (!await dockerAvailable()) throw new Error('docker unavailable');

  const image = IMAGES[lang];
  await ensureImage(image);

  const args = [
    'run', '--rm',
    '--network', 'none',
    '--memory', '256m',
    '--cpus', '0.5',
    '--pids-limit', '64',
    '--read-only',
    '--tmpfs', '/tmp:rw,size=32m,noexec',
    '--cap-drop', 'ALL',
    '--security-opt', 'no-new-privileges',
    image,
    ...RUN_CMD[lang],
    code,
  ];

  return new Promise((res) => {
    const t0 = Date.now();
    const p = spawn('docker', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let out = '', err = '', killed = false;
    const timer = setTimeout(() => { killed = true; p.kill('SIGKILL'); }, timeoutMs);

    p.stdout.on('data', d => { out += d; if (out.length > 100_000) p.kill(); });
    p.stderr.on('data', d => { err += d; if (err.length > 100_000) p.kill(); });

    p.on('close', (exitCode, signal) => {
      clearTimeout(timer);
      res({
        engine: 'docker',
        image,
        verdict: exitCode === 0 && !killed ? 'PASS' : 'FAIL',
        exitCode, signal,
        timedOut: killed,
        durationMs: Date.now() - t0,
        stdout: out.slice(0, 20_000),
        stderr: err.slice(0, 20_000),
      });
    });
  });
}
