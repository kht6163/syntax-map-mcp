import { execFile } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export const REQUIRED_PACKAGE_FILES = [
  'package.json',
  'README.md',
  'CHANGELOG.md',
  'LICENSE',
  'docs/tools.md',
  'dist/cli.js',
  'dist/server.js',
  'dist/tools.js',
  'dist/workspace.js',
  'dist/parser.js',
  'dist/analysis/index.js'
];

export function validatePackageFiles(files, requiredFiles = REQUIRED_PACKAGE_FILES) {
  const fileSet = new Set(files);
  return requiredFiles.filter(file => !fileSet.has(file));
}

export async function getPackedFiles() {
  const { stdout } = await execFileAsync('npm', ['pack', '--json', '--dry-run'], {
    cwd: process.cwd(),
    maxBuffer: 1024 * 1024 * 10
  });
  const [packResult] = JSON.parse(stdout);

  return packResult.files.map(file => file.path);
}

export async function checkPackageFiles() {
  const files = await getPackedFiles();
  const missingFiles = validatePackageFiles(files);

  if (missingFiles.length > 0) {
    console.error('Missing required package files:');
    for (const file of missingFiles) {
      console.error(`- ${file}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Package file check passed (${files.length} files).`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  await checkPackageFiles();
}
