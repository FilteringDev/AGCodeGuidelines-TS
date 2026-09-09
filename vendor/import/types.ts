import type { Linter, Rule } from 'eslint';
import type {
    RuleContext as ParserRuleContext,
    LegacyListener,
    Node,
    Token,
    Comment,
    Fixer,
    Scope,
    Variable,
    Report,
    SourceCode as ParserSourceCode,
} from '../react/types';
/**
 * @file Contracts for import rules, dependency parsers, and resolver plugins.
 */

export type {
    Node, Token, Comment, Fixer, Scope, Variable, LegacyListener, Report,
};

/**
 * Token cursors retained by the legacy import rule API.
 */
export interface SourceCode extends ParserSourceCode {
    getTokenOrCommentAfter(node: Node | Token): Token | null;
    getTokenOrCommentBefore(node: Node | Token): Token | null;
}
export type ResolverConfig = string | ResolverConfig[] | Record<string, unknown>;
export interface ImportSettings {
    'import/extensions'?: string[];
    'import/parsers'?: Record<string, string[]>;
    'import/cache'?: { lifetime?: number | '∞' | 'Infinity' };
    'import/core-modules'?: string[];
    'import/external-module-folders'?: string[];
    'import/internal-regex'?: string;
    'import/ignore'?: string[];
    'import/resolver'?: ResolverConfig;
    'import/resolve'?: unknown;
    'import/docstyle'?: string[];
}
export interface CacheSettings {
    lifetime: number;
}
export type VisitorKeys = Readonly<Record<string, readonly string[]>>;
export type ParsedProgram = Node<'Program'> & {
    comments: Comment[];
    tokens: Token[];
    visitorKeys?: VisitorKeys | null;
    ast?: ParsedProgram;
};
export type ParserOptions = Omit<Linter.ParserOptions, 'ecmaVersion'> & {
    ecmaVersion?: number | 'latest';
    tsconfigRootDir?: string;
    filePath?: string;
    comment?: boolean;
    tokens?: boolean;
    loc?: boolean;
    range?: boolean;
};
export interface DependencyParser {
    parse?(content: string, options: ParserOptions): ParsedProgram;
    parseForESLint?(
        content: string,
        options: ParserOptions,
    ): { ast: ParsedProgram; visitorKeys?: VisitorKeys };
    VisitorKeys?: VisitorKeys;
}
export interface ParserContext {
    settings: ImportSettings;
    parserOptions?: ParserOptions;
    parserPath?: string | null;
    languageOptions?: {
        parser?: DependencyParser;
        parserOptions?: ParserOptions;
        ecmaVersion?: number | 'latest';
        sourceType?: 'script' | 'module' | 'commonjs';
    };
}
export interface ChildContext extends ParserContext {
    path: string;
    cacheKey?: string;
}
export type RuleContext<Options extends readonly unknown[] = readonly unknown[]> = Omit<
    ParserRuleContext<Options>,
    keyof ParserContext | 'sourceCode' | 'getSourceCode'
> &
    ParserContext & { sourceCode: SourceCode; getSourceCode(): SourceCode };
export interface LegacyRule<Options extends readonly unknown[] = readonly unknown[]> {
    meta?: Rule.RuleMetaData;
    create(context: RuleContext<Options>): LegacyListener;
}
export type ModuleSource = Node<'Literal' | 'StringLiteral'> & { value: string };
export interface ModuleVisitorOptions {
    amd?: boolean;
    commonjs?: boolean;
    esmodule?: boolean;
    ignore?: string[];
}
export type ResolvedResult = { found: false; path?: undefined } | { found: true; path: string | null };
export type Resolver =
    | {
        interfaceVersion: 2;
        resolve(modulePath: string, sourceFile: string, config: unknown): ResolvedResult;
    }
    | {
        interfaceVersion?: 1;
        resolveImport(modulePath: string, sourceFile: string, config: unknown): string | undefined;
    };

export interface PackageLookupOptions {
    cwd?: string;
    normalize?: boolean;
}
export interface PackageJson {
    name?: string;
    version?: string;
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
    optionalDependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    bundleDependencies?: string[] | Record<string, unknown>;
    bundledDependencies?: string[] | Record<string, unknown>;
}
