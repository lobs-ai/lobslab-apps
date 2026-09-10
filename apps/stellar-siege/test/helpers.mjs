import { once } from 'node:events';
import net from 'node:net';
import { spawn } from 'node:child_process';

export async function getFreePort() {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, () => {
      const address = server.address();
      const port = typeof address === 'object' && address ? address.port : null;
      server.close(err => {
        if (err) reject(err);
        else resolve(port);
      });
    });
    server.on('error', reject);
  });
}

export async function startServer(port) {
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: process.cwd(),
    env: { ...process.env, PORT: String(port) },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stdout = '';
  let stderr = '';

  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => { stdout += chunk; });
  child.stderr.on('data', chunk => { stderr += chunk; });

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`server start timeout\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    }, 5000);

    child.stdout.on('data', chunk => {
      if (chunk.includes('Stellar Siege running at')) {
        clearTimeout(timeout);
        resolve();
      }
    });

    child.once('exit', code => {
      clearTimeout(timeout);
      reject(new Error(`server exited early with code ${code}\nstdout:\n${stdout}\nstderr:\n${stderr}`));
    });
  });

  return {
    child,
    getStdout: () => stdout,
    getStderr: () => stderr,
    async stop() {
      if (child.exitCode !== null) return;
      child.kill('SIGINT');
      try {
        await once(child, 'exit');
      } catch {
        // ignore teardown races
      }
    },
  };
}
