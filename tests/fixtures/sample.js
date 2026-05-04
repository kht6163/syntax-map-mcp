import path from 'node:path';

export class FileReporter {
  report(fileName) {
    return path.basename(fileName);
  }
}

export function makeReporter() {
  return new FileReporter();
}

const reporter = makeReporter();
reporter.report('/tmp/example.js');
