import { ResolverFactory } from 'oxc-resolver';
/**
 * @file Resolve TypeScript modules, aliases, package exports, and project references with Oxc.
 */

const resolver = new ResolverFactory({
    tsconfig: 'auto',
    builtinModules: true,
    extensions: ['.ts', '.tsx', '.mts', '.cts', '.js', '.jsx', '.mjs', '.cjs', '.json'],
    extensionAlias: {
        '.js': ['.ts', '.tsx', '.js'],
        '.mjs': ['.mts', '.mjs'],
        '.cjs': ['.cts', '.cjs'],
    },
    conditionNames: ['types', 'import', 'node', 'default'],
    mainFields: ['types', 'typings', 'module', 'main'],
});

const typescriptResolver = {
    interfaceVersion: 2 as const,
    /**
     * Resolve a specifier relative to the importing source file.
     * @param specifier - Imported package or relative module name.
     * @param filename - Absolute filename of the importing module.
     * @returns Resolution status and filename, or null for a builtin.
     */
    resolve(
        specifier: string,
        filename: string,
    ): { found: false } | { found: true; path: string | null } {
        const result = resolver.resolveFileSync(filename, specifier);
        if (result.builtin) {
            return { found: true, path: null };
        }
        return result.path ? { found: true, path: result.path } : { found: false };
    },
};

export default typescriptResolver;
