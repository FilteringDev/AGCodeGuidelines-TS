import { warn } from 'node:console';
import { extname } from 'node:path';
import fs from 'node:fs';
import debug from 'debug';
import moduleRequire from './module-require';
import enumerableKeys from './enumerableKeys';
import type {
    DependencyParser, VisitorKeys, ParsedProgram, ParserContext,
} from '../types';

const log = debug('eslint-plugin-import:parse');

/**
 * Get babel eslint visitor keys.
 * @param parserPath The parser path value.
 * @returns The result of this check.
 */
function getBabelEslintVisitorKeys(parserPath: string) {
    if (parserPath.endsWith('index.js')) {
        const hypotheticalLocation = parserPath.replace('index.js', 'visitor-keys.js');
        if (fs.existsSync(hypotheticalLocation)) {
            const keys = moduleRequire(hypotheticalLocation) as { default?: VisitorKeys } | VisitorKeys;
            return (keys.default || keys) as VisitorKeys;
        }
    }
    return null;
}

/**
 * Keys from parser.
 * @param parserPath The parser path value.
 * @param parserInstance The parser instance value.
 * @param [parsedResult] The parsed result value.
 * @param [parsedResult.visitorKeys] The visitorKeys value.
 * @returns The result of this check.
 */
function keysFromParser(
    parserPath: string | DependencyParser,
    parserInstance: DependencyParser,
    parsedResult?: { visitorKeys?: VisitorKeys },
) {
    // Exposed by @typescript-eslint/parser and @babel/eslint-parser
    if (parsedResult && parsedResult.visitorKeys) {
        return parsedResult.visitorKeys;
    }
    // The old babel parser doesn't have a `parseForESLint` eslint function, so we don't end
    // up with a `parsedResult` here.  It also doesn't expose the visitor keys on the parser itself,
    // so we have to try and infer the visitor-keys module from the parserPath.
    // This is NOT supported in flat config!
    if (typeof parserPath === 'string' && parserPath.indexOf('babel-eslint') > -1) {
        return getBabelEslintVisitorKeys(parserPath);
    }
    // The espree parser doesn't have the `parseForESLint` function, so we don't end up with a
    // `parsedResult` here, but it does expose the visitor keys on the parser instance that we can use.
    if (parserInstance && parserInstance.VisitorKeys) {
        return parserInstance.VisitorKeys;
    }
    return null;
}

// this exists to smooth over the unintentional breaking change in v2.7.
// TODO, semver-major: avoid mutating `ast` and return a plain object instead.

/**
 * Make parse return.
 * @param ast The ast value.
 * @param visitorKeys The visitor keys value.
 * @returns The result of this check.
 */
function makeParseReturn(
    ast: ParsedProgram,
    visitorKeys: VisitorKeys | null,
): ParsedProgram & { ast: ParsedProgram } {
    if (ast) {
        Object.assign(ast, { visitorKeys });

        Object.assign(ast, { ast });
    }
    return ast as ParsedProgram & { ast: ParsedProgram };
}

/**
 * Strip unicode bom.
 * @param text The text value.
 * @returns The result of this check.
 */
function stripUnicodeBOM(text: string) {
    return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
}

/**
 * Transform hashbang.
 * @param text The text value.
 * @returns The result of this check.
 */
function transformHashbang(text: string) {
    return text.replace(/^#!([^\r\n]+)/u, (_, captured) => `//${captured}`);
}

/**
 * Get parser path.
 * @param path The path value.
 * @param context The rule context.
 * @returns The result of this check.
 */
function getParserPath(path: string, context: ParserContext) {
    const parsers = context.settings['import/parsers'];
    if (parsers != null) {
        const extension = extname(path);
        {
            const parserKeys = enumerableKeys(parsers);
            for (let parserIndex = 0; parserIndex < parserKeys.length; parserIndex += 1) {
                const parserPath = parserKeys[parserIndex]!;
                if (parsers[parserPath]!.indexOf(extension) > -1) {
                    // use this alternate parser
                    log('using alt parser:', parserPath);
                    return parserPath;
                }
            }
        }
    }
    // default to use ESLint parser
    return context.parserPath;
}

/**
 * Get parser.
 * @param path The path value.
 * @param context The rule context.
 * @returns The result of this check.
 */
function getParser(path: string, context: ParserContext) {
    const parserPath = getParserPath(path, context);
    if (parserPath) {
        return parserPath;
    }
    if (
        !!context.languageOptions
        && !!context.languageOptions.parser
        && typeof context.languageOptions.parser !== 'string'
        && (typeof context.languageOptions.parser.parse === 'function'
            || typeof context.languageOptions.parser.parseForESLint === 'function')
    ) {
        return context.languageOptions.parser;
    }

    return null;
}

/**
 * Parse.
 * @param path The path value.
 * @param initialContent The initial content value.
 * @param context The rule context.
 * @returns The result of this check.
 */
export default function parse(path: string, initialContent: string, context: ParserContext) {
    let content = initialContent;

    if (context == null) {
        throw new Error('need context to parse properly');
    }

    // ESLint in "flat" mode only sets context.languageOptions.parserOptions
    const { languageOptions } = context;
    let parserOptions = (languageOptions && languageOptions.parserOptions) || context.parserOptions;
    const parserOrPath = getParser(path, context);

    if (!parserOrPath) {
        throw new Error('parserPath or languageOptions.parser is required!');
    }

    // hack: espree blows up with frozen options
    parserOptions = { ...parserOptions };
    parserOptions.ecmaFeatures = { ...parserOptions.ecmaFeatures };

    // always include comments and tokens (for doc parsing)
    parserOptions.comment = true;
    parserOptions.attachComment = true; // keeping this for backward-compat with  older parsers
    parserOptions.tokens = true;

    // attach node locations
    parserOptions.loc = true;
    parserOptions.range = true;

    // provide the `filePath` like eslint itself does, in `parserOptions`
    // https://github.com/eslint/eslint/blob/3ec436ee/lib/linter.js#L637
    parserOptions.filePath = path;

    // @typescript-eslint/parser will parse the entire project with typechecking if you provide
    // "project" or "projects" in parserOptions. Removing these options means the parser will
    // only parse one file in isolate mode, which is much, much faster.
    // https://github.com/import-js/eslint-plugin-import/issues/1408#issuecomment-509298962
    delete parserOptions.EXPERIMENTAL_useProjectService;
    delete parserOptions.projectService;
    delete parserOptions.project;
    delete parserOptions.projects;

    // If this is a flat config, we need to add ecmaVersion and sourceType (if present) from languageOptions
    if (languageOptions && languageOptions.ecmaVersion) {
        parserOptions.ecmaVersion = languageOptions.ecmaVersion;
    }
    if (languageOptions && languageOptions.sourceType) {
        // Non-flat config parserOptions.sourceType doesn't have "commonjs" in the type.  Once upgraded to v9 types,
        // they'll be the same and this expect-error should be removed.
        parserOptions.sourceType = languageOptions.sourceType;
    }

    // require the parser relative to the main module (i.e., ESLint)
    const parser = typeof parserOrPath === 'string'
        ? (moduleRequire(parserOrPath) as DependencyParser)
        : parserOrPath;

    // replicate bom strip and hashbang transform of ESLint
    // https://github.com/eslint/eslint/blob/b93af98b3c417225a027cabc964c38e779adb945/lib/linter/linter.js#L779
    content = transformHashbang(stripUnicodeBOM(String(content)));

    if (typeof parser.parseForESLint === 'function') {
        let ast;
        try {
            const parserRaw = parser.parseForESLint(content, parserOptions);
            ast = parserRaw.ast;

            return makeParseReturn(ast, keysFromParser(parserOrPath, parser, parserRaw));
        } catch (e) {
            const parseError = e as { lineNumber?: number; column?: number; message?: string };
            warn();
            warn(`Error while parsing ${parserOptions.filePath}`);

            warn(`Line ${parseError.lineNumber}, column ${parseError.column}: ${parseError.message}`);
        }
        if (!ast || typeof ast !== 'object') {
            warn(
                // Can only be invalid for custom parser per imports/parser
                `\`parseForESLint\` from parser \`${
                    typeof parserOrPath === 'string' ? parserOrPath : 'context.languageOptions.parser'
                }\` is invalid and will just be ignored`,
            );
        } else {
            return makeParseReturn(ast, keysFromParser(parserOrPath, parser, undefined));
        }
    }

    const ast = parser.parse!(content, parserOptions);

    return makeParseReturn(ast, keysFromParser(parserOrPath, parser, undefined));
}
