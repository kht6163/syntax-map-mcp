import { execFile } from 'node:child_process';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const INITIALIZE_ID = 1;
const SMOKE_TIMEOUT_MS = 10_000;

export function createInitializeRequest(id = INITIALIZE_ID) {
  return JSON.stringify({
    jsonrpc: '2.0',
    id,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      capabilities: {},
      clientInfo: {
        name: 'syntax-map-mcp-smoke-test',
        version: '1.0.0'
      }
    }
  });
}

export function readInitializeServerInfo(lines, id) {
  for (const line of lines) {
    if (line.trim().length === 0) {
      continue;
    }

    const message = JSON.parse(line);
    if ((id === undefined || message.id === id) && message.result?.serverInfo) {
      return message.result.serverInfo;
    }
  }

  throw new Error('MCP initialize response was not found');
}

async function createPackageTarball(packDirectory) {
  const { stdout } = await execFileAsync('npm', ['pack', '--json', '--pack-destination', packDirectory], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 10
  });
  const [packResult] = JSON.parse(stdout);

  return path.join(packDirectory, packResult.filename);
}

async function installPackedPackage(installDirectory, tarballPath) {
  await writeFile(path.join(installDirectory, 'package.json'), '{"private":true,"type":"module"}\n');
  await execFileAsync('npm', ['install', '--silent', '--no-audit', '--package-lock=false', tarballPath], {
    cwd: installDirectory,
    maxBuffer: 1024 * 1024 * 10
  });
}

async function runInstalledServer(installDirectory) {
  const binPath = path.join(installDirectory, 'node_modules', '.bin', 'syntax-map-mcp');
  const child = execFile(binPath, ['--workspace-root', installDirectory], {
    cwd: installDirectory,
    timeout: SMOKE_TIMEOUT_MS,
    maxBuffer: 1024 * 1024 * 10
  });
  const stdoutLines = [];
  let stdoutBuffer = '';
  let stderr = '';

  child.stdout?.on('data', chunk => {
    stdoutBuffer += chunk.toString();
    const lines = stdoutBuffer.split(/\r?\n/);
    stdoutBuffer = lines.pop() ?? '';
    stdoutLines.push(...lines);
  });
  child.stderr?.on('data', chunk => {
    stderr += chunk.toString();
  });

  const serverInfoPromise = new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`Timed out waiting for MCP initialize response. stderr: ${stderr.trim()}`));
    }, SMOKE_TIMEOUT_MS);

    child.stdout?.on('data', () => {
      try {
        const info = readInitializeServerInfo(stdoutLines, INITIALIZE_ID);
        clearTimeout(timer);
        resolve(info);
      } catch {
        // Wait for more stdout lines.
      }
    });
    child.on('error', error => {
      clearTimeout(timer);
      reject(error);
    });
    child.on('exit', code => {
      clearTimeout(timer);
      reject(new Error(`Installed server exited before initialize response with code ${code}. stderr: ${stderr.trim()}`));
    });
  });

  child.stdin?.write(`${createInitializeRequest()}\n`);

  const serverInfo = await serverInfoPromise;
  child.kill();
  return serverInfo;
}

export async function smokePackageInstall() {
  const packageJson = JSON.parse(await readFile('package.json', 'utf8'));
  const tempRoot = await mkdtemp(path.join(tmpdir(), 'syntax-map-mcp-smoke-'));
  const packDirectory = path.join(tempRoot, 'pack');
  const installDirectory = path.join(tempRoot, 'install');

  try {
    await mkdir(packDirectory);
    await mkdir(installDirectory);

    const tarballPath = await createPackageTarball(packDirectory);
    await installPackedPackage(installDirectory, tarballPath);
    const serverInfo = await runInstalledServer(installDirectory);

    if (serverInfo.name !== 'syntax-map-mcp' || serverInfo.version !== packageJson.version) {
      throw new Error(
        `Unexpected serverInfo from installed package: ${JSON.stringify(serverInfo)}; expected version ${packageJson.version}`
      );
    }

    console.log(`Package install smoke test passed (${serverInfo.name}@${serverInfo.version}).`);
  } finally {
    await rm(tempRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await smokePackageInstall();
}
