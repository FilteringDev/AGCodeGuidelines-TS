/** @file Include the license notices for bundled dependencies and rule sources. */
import {
    readFile, readdir, stat, writeFile,
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';

const vendors = [
    ['core', 'ESLint core rule source', '8.57.1', 'https://github.com/eslint/eslint'],
    ['jsdoc', 'eslint-plugin-jsdoc', '64.3.6', 'https://github.com/gajus/eslint-plugin-jsdoc'],
    ['react', 'eslint-plugin-react', '7.37.5', 'https://github.com/jsx-eslint/eslint-plugin-react'],
    [
        'import',
        'eslint-plugin-import and eslint-module-utils',
        '2.32.0',
        'https://github.com/import-js/eslint-plugin-import',
    ],
];
const notices = new Map<string, string>();
for (const [folder, name, version, repository] of vendors) {
    notices.set(
        name!,
        `## ${name} ${version}\n\n${repository}\n\n${await readFile(`vendor/${folder}/LICENSE`, 'utf8')}\n`,
    );
}
for (const packageName of ['oxlint-plugin', 'oxlint-config', 'rule-catalog']) {
    const meta = JSON.parse(await readFile(`packages/${packageName}/dist/build-meta.json`, 'utf8')) as {
        inputs: Record<string, unknown>;
    };
    for (const input of Object.keys(meta.inputs).filter((name) => name.includes('node_modules/'))) {
        let directory = dirname(resolve(input));
        while (directory !== dirname(directory)) {
            try {
                const file = join(directory, 'package.json');
                if ((await stat(file)).isFile()) {
                    const pkg = JSON.parse(await readFile(file, 'utf8')) as { name: string; version: string };
                    const id = `${pkg.name}@${pkg.version}`;
                    if (!notices.has(id)) {
                        const names = (await readdir(directory)).filter((name) => /^(?:licen[cs]e|copying)(?:[.-].*)?$/iu.test(name));
                        if (!names.length) {
                            const readme = await readFile(join(directory, 'README.md'), 'utf8');
                            const match = /(?:^#+\s+|\n)(?:Licence|License|Copyright and Licensing|Credits and collaboration)[^\n]*\n(?:-+\n)?([^]*)/imu.exec(
                                readme,
                            );
                            if (!match) {
                                throw new Error(`Missing bundled dependency license: ${id}`);
                            }
                            notices.set(id, `## ${id}\n\n${match[1]}\n`);
                            break;
                        }
                        const licenseDirectory = directory;
                        const text = (
                            await Promise.all(names.map((name) => readFile(join(licenseDirectory, name), 'utf8')))
                        ).join('\n');
                        notices.set(id, `## ${id}\n\n${text}\n`);
                    }
                    break;
                }
            } catch (error: unknown) {
                if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
                    throw error;
                }
            }
            directory = dirname(directory);
        }
    }
}
const content = `# Third-party notices\n\nBundled rule implementations and standalone libraries retain their upstream licenses. No ESLint engine is included.\n\n${[
    ...notices.entries(),
]
    .sort(([left], [right]) => left.localeCompare(right, 'en'))
    .map(([, value]) => value)
    .join('\n')}`;
for (const name of ['oxlint-plugin', 'oxlint-config', 'rule-catalog']) {
    await writeFile(`packages/${name}/THIRD_PARTY_NOTICES.md`, content);
}
await writeFile('docs/THIRD_PARTY_NOTICES.md', content);
