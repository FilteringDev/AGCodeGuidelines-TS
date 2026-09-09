import path from 'node:path';
import pkgUp from './pkgUp';

/**
 * Inspect node.
 * @param [cwd] The cwd value.
 * @returns The result of this check.
 */
export default function packageDirectory(cwd?: string) {
    const fp = pkgUp({ cwd });
    return fp ? path.dirname(fp) : null;
}
