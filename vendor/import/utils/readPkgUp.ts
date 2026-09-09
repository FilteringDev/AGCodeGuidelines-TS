import fs from 'node:fs';
import type { PackageLookupOptions, PackageJson } from '../types';
import pkgUp from './pkgUp';

/**
 * Strip bom.
 * @param str The str value.
 * @returns The result of this check.
 */
function stripBOM(str: string) {
    return str.replace(/^\uFEFF/, '');
}

/**
 * Derived significantly from read-pkg-up@2.0.0. See license below.
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
 * @param [opts] The opts value.
 * @returns The result of this check.
 */

/**
 * Read pkg up.
 * @param [opts] The opts value.
 * @returns The result of this check.
 */
export default function readPkgUp(
    opts?: PackageLookupOptions,
): { pkg?: undefined; path?: undefined } | { pkg: PackageJson; path: string } {
    const fp = pkgUp(opts);

    if (!fp) {
        return {};
    }

    try {
        return {
            pkg: JSON.parse(stripBOM(fs.readFileSync(fp, { encoding: 'utf-8' }))) as PackageJson,
            path: fp,
        };
    } catch (e) {
        return {};
    }
}
