import { createRequire } from 'node:module';
import { dirname } from 'node:path';
import { tsConfigLoader } from 'tsconfig-paths/lib/tsconfig-loader.js';
import type { ParserContext } from '../../types';
import { hashObject } from '../../utils/hash';

const requireExternal = createRequire(import.meta.url);

let ts: TypeScriptConfigReader | undefined;
const tsconfigCache = new Map<string, TypeScriptConfig | null>();

/**
 * Read ts config.
 * @param context The rule context.
 * @returns The result of this check.
 */
function readTsConfig(context: ParserContext) {
    const tsconfigInfo = tsConfigLoader({
        cwd: (context.parserOptions && context.parserOptions.tsconfigRootDir) || process.cwd(),
        getEnv: (key) => process.env[key],
    });
    try {
        if (tsconfigInfo.tsConfigPath !== undefined) {
            // Projects not using TypeScript won't have `typescript` installed.
            if (!ts) {
                ts = requireExternal('typescript') as TypeScriptConfigReader;
            }

            const configFile = ts.readConfigFile(tsconfigInfo.tsConfigPath, ts.sys.readFile);
            return ts.parseJsonConfigFileContent(
                configFile.config,
                ts.sys,
                dirname(tsconfigInfo.tsConfigPath),
            );
        }
    } catch (e) {
        // Catch any errors
    }

    return null;
}

/**
 * Is es module interop.
 * @param context The rule context.
 * @returns The result of this check.
 */
export default function isEsModuleInterop(context: ParserContext) {
    const cacheKey = hashObject({
        tsconfigRootDir: context.parserOptions && context.parserOptions.tsconfigRootDir,
    }).digest('hex');
    let tsConfig = tsconfigCache.get(cacheKey);
    if (typeof tsConfig === 'undefined') {
        tsConfig = readTsConfig(context);
        tsconfigCache.set(cacheKey, tsConfig);
    }

    return tsConfig && tsConfig.options ? tsConfig.options.esModuleInterop : false;
}

interface TypeScriptConfig {
    options?: { esModuleInterop?: boolean };
}
interface TypeScriptConfigReader {
    sys: { readFile(path: string): string | undefined };
    readConfigFile(path: string, readFile: (path: string) => string | undefined): { config: unknown };
    parseJsonConfigFileContent(
        config: unknown,
        sys: TypeScriptConfigReader['sys'],
        directory: string,
    ): TypeScriptConfig;
}
