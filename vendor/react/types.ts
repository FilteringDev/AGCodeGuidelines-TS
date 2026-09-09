/**
 * @file Typed contracts for React rules using the legacy Oxlint AST and scope APIs.
 */
import type {
    AST, Rule, Scope as ESLintScope, SourceCode as ESLintSourceCode,
} from 'eslint';
import type * as ESTree from 'estree-jsx';
import type { TSESTree } from '@typescript-eslint/types';
import type * as Babel from '@babel/types';

// JSX children include spread children, omitted from the upstream NodeMap.
declare module 'estree' {
    interface NodeMap {
        JSXSpreadChild: ESTree.JSXSpreadChild;
    }
}
type BabelNode =
    | Exclude<Babel.Node, Babel.NewExpression>
    | (Omit<Babel.NewExpression, 'typeParameters'> & {
        typeParameters?: Babel.TypeParameterInstantiation | Babel.TSTypeParameterInstantiation | null;
    });
type RawParserNode =
    | ESTree.Node
    | ESTree.MaybeNamedFunctionDeclaration
    | ESTree.MaybeNamedClassDeclaration
    | TSESTree.Node
    | BabelNode
    | { type: 'ExperimentalSpreadProperty'; argument: ESTree.Expression }
    | { type: 'ExperimentalRestProperty'; argument: ESTree.Pattern }
    | {
        type: 'TSInterfaceHeritage';
        expression?: TSESTree.Expression;
        id?: ESTree.Identifier;
        typeParameters?: TSESTree.TSTypeParameterInstantiation;
    };
type ParserNode = RawParserNode;
type ParserKind = `${RawParserNode['type']}`;
type UnionKeys<Value> = Value extends unknown ? keyof Value : never;
type UnionField<Value, Key extends PropertyKey> = Value extends unknown
    ? Key extends keyof Value
        ? Value[Key]
        : undefined
    : never;
type Variants<Kind extends ParserKind> = Extract<ParserNode, { type: Kind }>;
type ArrayItem<Value> = Value extends readonly (infer Item)[] ? Item : never;
type NodeField<Kind extends ParserKind, Key extends PropertyKey> = Key extends 'source'
    ? Kind extends 'ImportDeclaration' | 'ExportAllDeclaration' | 'ExportNamedDeclaration'
        ?
              | ((NodeKinds['Literal'] | NodeKinds['StringLiteral']) & { value: string })
              | (Kind extends 'ExportNamedDeclaration' ? null | undefined : never)
        : Adapt<UnionField<Variants<Kind>, Key>>
    : Key extends 'properties'
        ? Kind extends 'ObjectExpression' | 'ObjectPattern'
            ? Array<
                | Adapt<ArrayItem<UnionField<Variants<Kind>, Key>>>
                | NodeKinds['ExperimentalSpreadProperty']
                | NodeKinds['ExperimentalRestProperty']
            >
            : Adapt<UnionField<Variants<Kind>, Key>>
        : Key extends 'expression'
            ? Kind extends 'JSXExpressionContainer'
                ? Adapt<UnionField<Variants<Kind>, Key>> | NodeKinds['JSXText']
                : Adapt<UnionField<Variants<Kind>, Key>>
            : Key extends 'children'
                ? Kind extends 'JSXElement' | 'JSXFragment'
                    ? Array<Adapt<ArrayItem<UnionField<Variants<Kind>, Key>>> | NodeKinds['Literal']>
                    : Adapt<UnionField<Variants<Kind>, Key>>
                : Key extends 'params'
                    ? Kind extends 'TypeParameterDeclaration'
                        ? (NodeKinds['TypeParameter'] | NodeKinds['Identifier'])[]
                        : Adapt<UnionField<Variants<Kind>, Key>>
                    : Adapt<UnionField<Variants<Kind>, Key>>;
type StructuralKeys = Exclude<UnionKeys<ParserNode>, 'loc' | 'range' | 'parent' | 'type'>;
// Rules probe structural fields before checking a node's tag. Missing fields
// remain undefined; each discriminant retains its parser-defined field types.
export type NodeKind<Kind extends ParserKind> = {
    [Key in Exclude<keyof Variants<Kind>, 'loc' | 'range' | 'parent' | 'type'>]: Key extends 'kind'
        ? NodeField<Kind, Key> | (Kind extends 'VariableDeclaration' ? 'type' : never)
        : NodeField<Kind, Key>;
} & {
    [Key in Exclude<
        UnionKeys<Variants<Kind>>,
        keyof Variants<Kind> | 'parent' | 'loc' | 'range'
    >]?: Adapt<UnionField<Variants<Kind>, Key>>;
} & {
    [Key in Exclude<StructuralKeys, UnionKeys<Variants<Kind>>>]?: undefined;
} & {
    type: Kind;
    loc: ESTree.SourceLocation;
    range: [number, number];
    parent: Kind extends 'JSXAttribute' | 'JSXSpreadAttribute'
        ? NodeKinds['JSXOpeningElement']
        : NodeKinds[ParserKind];
    heritage?: NodeKinds['TSInterfaceHeritage'][];
} & (Kind extends 'Program' ? { tokens: Token[]; comments: Comment[] } : unknown);
export type NodeKinds = { [Kind in ParserKind]: NodeKind<Kind> };
export type Node<Kind extends ParserKind = ParserKind> = NodeKinds[Kind];
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
        : T extends ESLintScope.Definition
            ? Definition
            : T extends { type: infer Kind extends ParserKind }
                ? NodeKinds[`${Kind}`]
                : T extends ESTree.Comment | Babel.Comment
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

type DefinitionFields<Value> = Value extends unknown
    ? { [Key in keyof Value]: Key extends 'node' ? Node : Adapt<Value[Key]> }
    : never;
export type Definition =
    | DefinitionFields<Exclude<ESLintScope.Definition, { type: 'TDZ' }>>
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
    TDZ: ParserKind;
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
export interface Fixer {
    insertTextAfter(nodeOrToken: Node | Token, text: string): Rule.Fix;
    insertTextAfterRange(range: [number, number], text: string): Rule.Fix;
    insertTextBefore(nodeOrToken: Node | Token, text: string): Rule.Fix;
    insertTextBeforeRange(range: [number, number], text: string): Rule.Fix;
    remove(nodeOrToken: Node | Token): Rule.Fix;
    removeRange(range: [number, number]): Rule.Fix;
    replaceText(nodeOrToken: Node | Token, text: string): Rule.Fix;
    replaceTextRange(range: [number, number], text: string): Rule.Fix;
}
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
        callback: (segment: CodePathSegment, controller: { skip(): void; break(): void }) => void,
    ): void;
    traverseSegments(
        options: { first?: CodePathSegment; last?: CodePathSegment },
        callback: (segment: CodePathSegment, controller: { skip(): void; break(): void }) => void,
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
    getCommentsBefore(node: Node | Token): Comment[];
    getCommentsAfter(node: Node | Token): Comment[];
    getCommentsInside(node: Node | Token): Comment[];
    getAncestors(node: Node): Node[];
    getScope(node: Node): Scope;
    markVariableAsUsed(name: string, node?: Node): boolean;
    tokensAndComments: Token[];
    getText(node?: Ranged | null, beforeCount?: number, afterCount?: number): string;
    getFirstToken(node: Node<Exclude<ParserKind, 'Program'>>): Token;
    getFirstToken(node: Ranged, options?: CursorOptions): Token | null;
    getLastToken(node: Node<Exclude<ParserKind, 'Program'>>): Token;
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
    getFirstTokens(node: Node, count: number): Token[];
    getSource: LegacyCursors['getText'];
    settings: ReactSettings;
    report(descriptor: Report): void;
    report(node: Node | Token, message: string, data?: Record<string, unknown>): void;
    report(
        node: Node | Token,
        location: ESTree.SourceLocation | ESTree.Position,
        message: string,
        data?: Record<string, unknown>,
    ): void;
};
export type ReportMessage =
    | { messageId: string; message?: never }
    | { message: string; messageId?: never };
type ReportLocation = ESTree.Position | { start: ESTree.Position; end?: ESTree.Position | null };
type ReportPosition =
    | { node: Node | Token; loc?: ReportLocation }
    | { node?: Node | Token | null; loc: ReportLocation };
export type FixFunction = (fixer: Fixer) => Rule.Fix | Iterable<Rule.Fix> | false | null | undefined;
export type Suggestion = ReportMessage & { data?: Record<string, unknown>; fix: FixFunction };
export type Report = ReportMessage &
    ReportPosition & {
        data?: Record<string, unknown>;
        fix?: FixFunction | null;
        suggest?: Suggestion[] | false | null;
    };
export type LegacyAPI<T> = Adapt<T>;
type NodeEvent = ParserKind | `${ParserKind}:exit`;
type EventKind<Event extends NodeEvent> = Event extends `${infer Kind extends ParserKind}:exit`
    ? Kind
    : Extract<Event, ParserKind>;
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

export interface WrapperFunction {
    property: string;
    object?: string;
    exact?: boolean;
}
export interface LinkComponent {
    name: string;
    linkAttribute: string | string[];
}
export interface ReactSettings {
    react?: {
        version?: string;
        defaultVersion?: string;
        flowVersion?: string;
        pragma?: string;
        fragment?: string;
        createClass?: string;
    };
    componentWrapperFunctions?: (string | WrapperFunction)[];
    propWrapperFunctions?: (string | WrapperFunction)[];
    linkComponents?: (string | LinkComponent)[];
    formComponents?: (string | { name: string; formAttribute: string | string[] })[];
}

export type ReportDetails = ReportPosition & {
    data?: Record<string, unknown>;
    fix?: FixFunction | null;
    suggest?: Suggestion[] | false | null;
};
