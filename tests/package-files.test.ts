import { describe, expect, it } from 'vitest';
import { REQUIRED_PACKAGE_FILES, validatePackageFiles } from '../scripts/check-package-files.mjs';

describe('package file validation', () => {
  it('passes when all required package files are present', () => {
    expect(validatePackageFiles(REQUIRED_PACKAGE_FILES)).toEqual([]);
  });

  it('reports missing required package files', () => {
    const files = REQUIRED_PACKAGE_FILES.filter(file => file !== 'docs/tools.md');

    expect(validatePackageFiles(files)).toEqual(['docs/tools.md']);
  });
});
