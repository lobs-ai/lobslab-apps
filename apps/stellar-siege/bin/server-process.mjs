import { spawn, execFileSync } from 'node:child_process';
import fs from 'node:fs';
import net from 'node:net';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
const serverPath = fileURLToPath(new URL('../server.mjs', import.meta.url));
const pidFile = '.stellar-siege.pid';
const pause = ms => new Promise(resolve => setTimeout(resolve, ms));
let state;
try { state = JSON.parse(fs.readFileSync(pidFile, 'utf8')); } catch {}
function running() {
  if (!Number.isInteger(state?.pid)) return false;
  try {
    return execFileSync('ps', ['-p', String(state.pid), '-o', 'command='], { encoding: 'utf8' }).includes(serverPath);
  } catch { return false; }
}
const command = process.argv[2];
if (command === 'status') {
  console.log(running() ? `Stellar Siege running at http://localhost:${state.port} (pid ${state.pid})` : 'Stellar Siege is not running');
} else if (command === 'stop') {
  if (running()) {
    process.kill(state.pid, 'SIGTERM');
    for (let i = 0; i < 50 && running(); i++) await pause(100);
    if (running()) throw new Error('Server did not stop within 5 seconds');
  }
  fs.rmSync(pidFile, { force: true });
  console.log('Stellar Siege stopped');
} else if (command === 'start') {
  if (running()) {
    console.log(`Stellar Siege already running at http://localhost:${state.port}`);
  } else {
    const port = Number(process.env.PORT || 47104);
    // Refuse an occupied port; never adopt or stop an unrelated process.
    await new Promise((resolve, reject) => {
      const probe = net.createServer();
      probe.once('error', reject);
      probe.listen(port, () => probe.close(resolve));
    });
    const log = fs.openSync('.server.log', 'a');
    const child = spawn(process.execPath, [serverPath], {
      detached: true, stdio: ['ignore', log, log], env: { ...process.env, PORT: String(port) },
    });
    fs.closeSync(log);
    child.unref();
    let ready = false;
    for (let i = 0; i < 50 && child.exitCode == null; i++) {
      ready = await new Promise(resolve => {
        const request = http.get(`http://127.0.0.1:${port}/`, response => { response.resume(); resolve(response.statusCode === 200); });
        request.on('error', () => resolve(false));
        request.setTimeout(200, () => { request.destroy(); resolve(false); });
      });
      if (ready) break;
      await pause(100);
    }
    if (!ready || child.exitCode != null) {
      child.kill('SIGTERM');
      throw new Error('Server failed to start. See .server.log');
    }
    fs.writeFileSync(pidFile, JSON.stringify({ pid: child.pid, port }));
    console.log(`Stellar Siege ready at http://localhost:${port} (pid ${child.pid})`);
  }
} else {
  throw new Error('Expected start, stop, or status');
}
