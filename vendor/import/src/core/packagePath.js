import { dirname } from 'path';
import { getPhysicalFilename } from '../../utils/contextCompat.js';
import pkgUp from '../../utils/pkgUp.js';
import readPkgUp from '../../utils/readPkgUp.js';

export function getFilePackagePath(filePath) {
  const fp = pkgUp({ cwd: filePath });
  return dirname(fp);
}

export function getContextPackagePath(context) {
  return getFilePackagePath(getPhysicalFilename(context));
}

export function getFilePackageName(filePath) {
  const { pkg, path } = readPkgUp({ cwd: filePath, normalize: false });
  if (pkg) {
    // recursion in case of intermediate esm package.json without name found
    return pkg.name || getFilePackageName(dirname(dirname(path)));
  }
  return null;
}
