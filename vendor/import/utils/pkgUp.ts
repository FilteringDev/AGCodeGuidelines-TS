import fs from 'node:fs';
import path from 'node:path';
import type { PackageLookupOptions } from '../types';

/**
 * Derived significantly from package find-up@2.0.0. See license below.
 *
 * MIT License
 *
 * Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 * @param filename The filename value.
 * @param [cwd] The cwd value.
 * @returns The result of this check.
 */

/**
 * Find up.
 * @param filename The filename value.
 * @param [cwd] The cwd value.
 * @returns The result of this check.
 */
function findUp(filename: string | string[], cwd?: string) {
    let dir = path.resolve(cwd || '');
    const { root } = path.parse(dir);

    const filenames = ([] as string[]).concat(filename);

    while (dir) {
        const currentDir = dir;
        const file = filenames.find((el) => fs.existsSync(path.resolve(currentDir, el)));

        if (file) {
            return path.join(dir, file);
        }
        if (dir === root) {
            return null;
        }

        dir = path.dirname(dir);
    }
    return null;
}

/**
 * Pkg up.
 * @param [opts] The opts value.
 * @returns The result of this check.
 */
export default function pkgUp(opts?: PackageLookupOptions) {
    return findUp('package.json', opts && opts.cwd);
}
