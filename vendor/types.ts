/** @file Typed contracts for the legacy ESTree API implemented by the Oxlint adapters. */
import type {
    AST, Rule, Scope as ESLintScope, SourceCode as ESLintSourceCode,
} from 'eslint';
import type * as ESTree from 'estree-jsx';

// JSX children include spread children, omitted from the upstream NodeMap.
declare module 'estree' {
    interface NodeMap {
        JSXSpreadChild: ESTree.JSXSpreadChild;
    }
}
type ParserNode =
    | ESTree.Node
    | ESTree.MaybeNamedFunctionDeclaration
    | ESTree.MaybeNamedClassDeclaration;

// Legacy rules also probe scalar fields before narrowing a node's discriminant.
// A field absent from an ESTree variant reads as undefined at runtime.
type ScalarProbe =
    | 'kind'
    | 'operator'
    | 'name'
    | 'optional'
    | 'computed'
    | 'async'
    | 'generator'
    | 'method'
    | 'shorthand'
    | 'directive'
    | 'value'
    | 'raw';
export type NodeKind<Kind extends ParserNode['type']> = Omit<
    {
        [Key in keyof Extract<ParserNode, { type: Kind }>]: Adapt<
            Extract<ParserNode, { type: Kind }>[Key]
        >;
    },
    | 'loc'
    | 'range'
    | 'parent'
    | (Kind extends 'ImportDeclaration' | 'ExportNamedDeclaration' | 'ExportAllDeclaration'
        ? 'source'
        : never)
> & {
    [Key in Exclude<ScalarProbe, keyof Extract<ParserNode, { type: Kind }>>]?: undefined;
} & {
    loc: ESTree.SourceLocation;
    range: [number, number];
    returnType?: NodeKinds[ParserNode['type']];
    typeAnnotation?: NodeKinds[ParserNode['type']];
    parent: NodeKinds[ParserNode['type']];
} & (Kind extends 'ImportDeclaration' | 'ExportAllDeclaration'
    ? {
        source: NodeKinds['Literal'] & { value: string };
    }
    : Kind extends 'ExportNamedDeclaration'
        ? {
            source?: (NodeKinds['Literal'] & { value: string }) | null;
        }
        : unknown) &
    (Kind extends 'Literal'
        ? {
            regex?: { pattern: string; flags: string };
            bigint?: string;
        }
        : Kind extends 'Program'
            ? {
                tokens: Token[];
                comments: Comment[];
            }
            : Kind extends 'ArrowFunctionExpression'
                ? {
                    id?: null;
                }
                : Kind extends 'ExpressionStatement'
                    ? {
                        directive?: string;
                    }
                    : unknown);
export type NodeKinds = { [Kind in ParserNode['type']]: NodeKind<Kind> };
export type Node<Kind extends ParserNode['type'] = ParserNode['type']> = NodeKinds[Kind];
export type Token =
    | (Omit<AST.Token, 'loc' | 'range' | 'type'> & {
        type: AST.Token['type'] | 'Shebang' | 'Hashbang' | 'Template' | 'PrivateIdentifier';
    } & { loc: ESTree.SourceLocation; range: [number, number] })
    | Comment;
export type Comment = Omit<ESTree.Comment, 'loc' | 'range'> & {
    loc: ESTree.SourceLocation;
    range: [number, number];
};

type Adapt<T> = 0 extends 1 & T
    ? unknown
    : T extends string | number | boolean | symbol | bigint | null | undefined
        ? T
        : T extends ParserNode
            ? NodeKinds[T['type']]
            : T extends ESTree.Comment
                ? Comment
                : T extends ESLintScope.Scope
                    ? Scope
                    : T extends ESLintScope.Variable
                        ? Variable
                        : T extends ESLintSourceCode
                            ? SourceCode
                            : T extends Rule.CodePath
                                ? CodePath
                                : T extends Rule.CodePathSegment
                                    ? CodePathSegment
                                    : T extends AST.Token
                                        ? Token
                                        : T extends (...args: infer Args) => infer Result
                                            ? (...args: { [Key in keyof Args]: Adapt<Args[Key]> }) => Adapt<Result>
                                            : T extends Map<infer Key, infer Value>
                                                ? Map<Adapt<Key>, Adapt<Value>>
                                                : T extends Set<infer Value>
                                                    ? Set<Adapt<Value>>
                                                    : T extends RegExp
                                                        ? T
                                                        : T extends readonly unknown[]
                                                            ? { [Key in keyof T]: Adapt<T[Key]> }
                                                            : T extends Iterable<infer Value>
                                                                ? Iterable<Adapt<Value>>
                                                                : T extends object
                                                                    ? { [Key in keyof T]: Adapt<T[Key]> }
                                                                    : T;

export type Definition =
    | Adapt<Exclude<ESLintScope.Definition, { type: 'TDZ' }>>
    | { type: 'TDZ'; node: Node; parent: null; name: Node<'Identifier'> };
export type Reference = Adapt<ESLintScope.Reference> & {
    readonly isTypeReference?: boolean;
    readonly isValueReference?: boolean;
};
type ScopeBase = Omit<
    {
        [Key in keyof ESLintScope.Scope]: Adapt<ESLintScope.Scope[Key]>;
    },
    'type' | 'block'
>;
interface ScopeBlocks {
    global: 'Program';
    module: 'Program';
    function: 'FunctionDeclaration' | 'FunctionExpression' | 'ArrowFunctionExpression';
    'function-expression-name': 'FunctionExpression';
    block: 'BlockStatement';
    catch: 'CatchClause';
    class: 'ClassDeclaration' | 'ClassExpression';
    for: 'ForStatement' | 'ForInStatement' | 'ForOfStatement';
    switch: 'SwitchStatement';
    with: 'WithStatement';
    TDZ: ParserNode['type'];
    'class-field-initializer': ESTree.Expression['type'];
    'class-static-block': 'StaticBlock';
}
export type Scope = {
    [Kind in keyof ScopeBlocks]: ScopeBase & { type: Kind; block: Node<ScopeBlocks[Kind]> };
}[keyof ScopeBlocks];
export type Variable = {
    [Key in keyof ESLintScope.Variable]: Key extends 'defs'
        ? Definition[]
        : Adapt<ESLintScope.Variable[Key]>;
} & {
    writeable?: boolean;
    eslintUsed?: boolean;
    eslintExported?: boolean;
    eslintExplicitGlobal?: boolean;
    eslintImplicitGlobalSetting?: 'readonly' | 'writable' | 'off';
    eslintExplicitGlobalComments?: Comment[];
};
export type Fixer = Adapt<Rule.RuleFixer>;
export type CodePathSegment = {
    [Key in keyof Rule.CodePathSegment]: Adapt<Rule.CodePathSegment[Key]>;
} & {
    allNextSegments: CodePathSegment[];
    allPrevSegments: CodePathSegment[];
    isLoopedPrevSegment(segment: CodePathSegment): boolean;
};
export type CodePath = {
    [Key in keyof Rule.CodePath]: Adapt<Rule.CodePath[Key]>;
} & {
    currentSegments: CodePathSegment[];
    traverseSegments(
        callback: (
            segment: CodePathSegment,
            controller: { skip(): void; break(): void },
        ) => void,
    ): void;
    traverseSegments(
        options: { first?: CodePathSegment; last?: CodePathSegment },
        callback: (
            segment: CodePathSegment,
            controller: { skip(): void; break(): void },
        ) => void,
    ): void;
};
type Ranged = Node | Token | Comment;
type CursorOptions =
    | number
    | ((token: Token) => boolean)
    | {
        skip?: number;
        count?: number;
        beforeCount?: number;
        afterCount?: number;
        includeComments?: boolean;
        filter?: (token: Token) => boolean;
    };
type Cursor = (node: Ranged, options?: CursorOptions) => Token | null;
type MultiCursor = (node: Ranged, options?: CursorOptions) => Token[];
type BetweenCursor = (left: Ranged, right: Ranged, options?: CursorOptions) => Token | null;
type MultiBetweenCursor = (left: Ranged, right: Ranged, options?: CursorOptions) => Token[];
interface LegacyCursors {
    tokensAndComments: Token[];
    getText(node?: Ranged, beforeCount?: number, afterCount?: number): string;
    getFirstToken(node: Node<Exclude<ParserNode['type'], 'Program'>>): Token;
    getFirstToken(node: Ranged, options?: CursorOptions): Token | null;
    getLastToken(node: Node<Exclude<ParserNode['type'], 'Program'>>): Token;
    getLastToken(node: Ranged, options?: CursorOptions): Token | null;
    getTokenBefore: Cursor;
    getTokenAfter: Cursor;
    getFirstTokens: MultiCursor;
    getLastTokens: MultiCursor;
    getTokensBefore: MultiCursor;
    getTokensAfter: MultiCursor;
    getTokens: MultiCursor;
    getFirstTokenBetween: BetweenCursor;
    getLastTokenBetween: BetweenCursor;
    getFirstTokensBetween: MultiBetweenCursor;
    getLastTokensBetween: MultiBetweenCursor;
    getTokensBetween: MultiBetweenCursor;
    getTokenByRangeStart(offset: number, options?: { includeComments?: boolean }): Token | null;
    getJSDocComment(node: Node): Comment | null;
    getComments(node: Node): { leading: Comment[]; trailing: Comment[] };
    isSpaceBetween(left: Ranged, right: Ranged): boolean;
    isSpaceBetweenTokens(left: Ranged, right: Ranged): boolean;
}
export type SourceCode = Omit<
    { [Key in keyof ESLintSourceCode]: Adapt<ESLintSourceCode[Key]> },
    keyof LegacyCursors
> &
    LegacyCursors;
export type RuleContext<Options extends readonly unknown[] = readonly unknown[]> = Omit<
    Adapt<Rule.RuleContext>,
    'options' | 'settings' | 'sourceCode' | 'getSourceCode' | 'report' | 'languageOptions'
> & {
    languageOptions: Omit<Adapt<Rule.RuleContext['languageOptions']>, 'ecmaVersion'> & {
        ecmaVersion: number;
    };
    sourceCode: SourceCode;
    getSourceCode(): SourceCode;
    options: Options;
    settings: Record<string, unknown>;
    report(descriptor: Report): void;
    report(node: Node | Token, message: string, data?: Record<string, unknown>): void;
    report(
        node: Node | Token,
        location: ESTree.SourceLocation | ESTree.Position,
        message: string,
        data?: Record<string, unknown>,
    ): void;
};
type ReportMessage =
    | { messageId: string; message?: never }
    | { message: string; messageId?: never };
type ReportLocation =
    | ESTree.Position
    | { start: ESTree.Position; end?: ESTree.Position | null };
type ReportPosition =
    | { node: Node | Token; loc?: ReportLocation }
    | { node?: Node | Token | null; loc: ReportLocation };
export type FixFunction = (fixer: Fixer) => Rule.Fix | Iterable<Rule.Fix> | null;
export type Suggestion = ReportMessage & { data?: Record<string, unknown>; fix: FixFunction };
export type Report = ReportMessage &
    ReportPosition & {
        data?: Record<string, unknown>;
        fix?: FixFunction | null;
        suggest?: Suggestion[] | null;
    };
export type LegacyAPI<T> = Adapt<T>;
type NodeEvent = ParserNode['type'] | `${ParserNode['type']}:exit`;
type EventKind<Event extends NodeEvent> =
    Event extends `${infer Kind extends ParserNode['type']}:exit`
        ? Kind
        : Extract<Event, ParserNode['type']>;
type PathEvent =
    | 'onCodePathStart'
    | 'onCodePathEnd'
    | 'onCodePathSegmentStart'
    | 'onCodePathSegmentEnd'
    | 'onUnreachableCodePathSegmentStart'
    | 'onUnreachableCodePathSegmentEnd'
    | 'onCodePathSegmentLoop';
interface PathListeners {
    onCodePathStart?: (codePath: CodePath, node: Node) => void;
    onCodePathEnd?: (codePath: CodePath, node: Node) => void;
    onCodePathSegmentStart?: (segment: CodePathSegment, node: Node) => void;
    onCodePathSegmentEnd?: (segment: CodePathSegment, node: Node) => void;
    onUnreachableCodePathSegmentStart?: (segment: CodePathSegment, node: Node) => void;
    onUnreachableCodePathSegmentEnd?: (segment: CodePathSegment, node: Node) => void;
    onCodePathSegmentLoop?: (from: CodePathSegment, to: CodePathSegment, node: Node) => void;
}
// Compound selectors can narrow nodes beyond their tag; the dispatcher checks those selectors before calling them.
type SelectedVisitor = { visit(node: Node): void }['visit'];
export type LegacyListener = {
    [Event in NodeEvent]?: (node: Node<EventKind<Event>>) => void;
} & PathListeners & {
    [selector: string]:
            | SelectedVisitor
            | { visit(comment: Comment): void }['visit']
            | PathListeners[PathEvent]
            | undefined;
};
export interface LegacyRule<Options extends readonly unknown[] = readonly unknown[]> {
    meta?: Omit<Rule.RuleMetaData, 'fixable'> & { fixable?: 'code' | 'whitespace' | null };
    create(context: RuleContext<Options>): LegacyListener;
}
