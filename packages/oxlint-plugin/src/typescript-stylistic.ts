/**
 * @file Expose TypeScript extension-style rules under a distinct Oxlint plugin identity.
 *
 * The pinned typescript-eslint sources (5.62 and 7.18) extend ESLint 8.57.1 core rules. Stylistic 5.x checks
 * more syntax for most of these rules, and fewer TypeScript nodes for `block-spacing` and `brace-style`. Each
 * rule skips the syntax its source rule does not check and adds the nodes its source rule checks, so that it
 * reports what the source rule reports.
 */
import { definePlugin } from '@oxlint/plugins';
import plugin from '@stylistic/eslint-plugin';

import type {
    Context,
    CreateRule,
    Node,
    Rule,
    Visitor,
} from '@oxlint/plugins';

const RULE_NAMES = [
    'block-spacing',
    'brace-style',
    'comma-dangle',
    'comma-spacing',
    'function-call-spacing',
    'indent',
    'key-spacing',
    'keyword-spacing',
    'lines-around-comment',
    'lines-between-class-members',
    'member-delimiter-style',
    'no-extra-parens',
    'no-extra-semi',
    'object-curly-spacing',
    'padding-line-between-statements',
    'quotes',
    'semi',
    'space-before-blocks',
    'space-before-function-paren',
    'space-infix-ops',
] as const;

type RuleName = (typeof RULE_NAMES)[number];

type Handler = (node: Node) => void;

/** Differences between a Stylistic rule and the syntax its typescript-eslint source rule checks. */
interface Coverage {
    /** Stylistic visitors for nodes that neither the typescript-eslint extension nor its base rule checks. */
    readonly skip?: readonly string[];
    /** Whether the rule options bind a skipped visitor key to another listener that must stay. */
    readonly keep?: (context: Context, node: string) => boolean;
    /** Nodes the source rule checks, mapped to the Stylistic visitor whose handler checks the same tokens. */
    readonly reuse?: Readonly<Record<string, string>>;
    /** Options adapter for a source rule that reads its options differently. */
    readonly adapt?: (context: Context) => Context;
    /** Visitors that the source rule skips for a node when `when` returns `true`. */
    readonly exempt?: {
        readonly nodes: readonly string[];
        readonly when: (context: Context, node: Node) => boolean;
    };
}

/**
 * Check the typescript-eslint `brace-style` exception for TypeScript bodies.
 * @param context - Oxlint rule context with the merged `brace-style` options.
 * @param node - TypeScript body whose first and last tokens are its braces.
 * @returns Whether `allowSingleLine` is set and both braces are on one line, which skips every check in the
 * typescript-eslint rule, including the check for an opening brace on the next line.
 */
function isSingleLineBody(context: Context, node: Node): boolean {
    const exceptions = context.options[1] as { allowSingleLine?: unknown } | undefined;
    const open = context.sourceCode.getFirstToken(node);
    const close = context.sourceCode.getLastToken(node);
    return exceptions?.allowSingleLine === true && open !== null && close !== null
        && open.loc.end.line === close.loc.start.line;
}

/**
 * Check whether `indent` options ignore a node type by the selector that names it.
 * @param context - Oxlint rule context with the merged `indent` options.
 * @param node - Node type of a skipped visitor.
 * @returns Whether `ignoredNodes` lists the node type, so that the visitor key holds the listener that ignores
 * the node's tokens instead of the listener that sets their offsets.
 */
function isIgnoredNode(context: Context, node: string): boolean {
    const options = context.options[1] as { ignoredNodes?: unknown } | undefined;
    return Array.isArray(options?.ignoredNodes) && options.ignoredNodes.includes(node);
}

/**
 * Normalize `comma-dangle` options the way the pinned source rules do.
 * @param context - Oxlint rule context; Oxlint has already merged the `["never"]` default into its options.
 * @returns Context whose options skip import attributes, dynamic imports, and function commas before ES2017.
 */
function commaDangleContext(context: Context): Context {
    const [option] = context.options;
    const version = context.settings.agRuleEcmaVersion;
    const normalized = typeof option === 'string'
        ? {
            arrays: option,
            objects: option,
            imports: option,
            exports: option,
            // ESLint 8 ignores function commas when the parser targets a version before ES2017.
            functions: typeof version === 'number' && version < 2017 ? 'ignore' : option,
            enums: option,
            generics: option,
            tuples: option,
        }
        : option as Record<string, unknown>;
    return Object.create(context, {
        options: { value: [{ ...normalized, importAttributes: 'ignore', dynamicImports: 'ignore' }] },
    }) as Context;
}

/** Visitor differences, audited against typescript-eslint 5.62 and 7.18 with ESLint 8.57.1 base rules. */
const COVERAGE: Partial<Record<RuleName, Coverage>> = {
    'block-spacing': {
        reuse: { TSEnumBody: 'BlockStatement', TSInterfaceBody: 'BlockStatement', TSTypeLiteral: 'BlockStatement' },
    },
    'brace-style': {
        reuse: { TSEnumBody: 'TSModuleBlock', TSInterfaceBody: 'TSModuleBlock' },
        exempt: { nodes: ['TSEnumBody', 'TSInterfaceBody', 'TSModuleBlock'], when: isSingleLineBody },
    },
    'comma-dangle': {
        skip: ['TSDeclareFunction', 'TSFunctionType', 'TSTypeParameterInstantiation'],
        adapt: commaDangleContext,
    },
    'function-call-spacing': { skip: ['ImportExpression'] },
    // typescript-eslint lists type arguments as known nodes but sets no offsets for their elements.
    indent: { skip: ['TSTypeParameterInstantiation'], keep: isIgnoredNode },
    'key-spacing': { skip: ['ImportAttribute'] },
    'keyword-spacing': { skip: ['AccessorProperty', 'TSSatisfiesExpression'] },
    'no-extra-parens': {
        skip: [
            'AccessorProperty',
            'TSArrayType',
            'TSEnumMember',
            'TSIntersectionType',
            'TSTypeAliasDeclaration',
            'TSTypeAnnotation',
            'TSUnionType',
        ],
    },
    'no-extra-semi': { skip: ['AccessorProperty'] },
    'object-curly-spacing': { skip: ['ExportAllDeclaration', 'TSEnumBody', 'TSInterfaceBody'] },
    semi: { skip: ['AccessorProperty'] },
    'space-before-blocks': { skip: ['TSModuleBlock'] },
    'space-before-function-paren': { skip: ['CatchClause'] },
    'space-infix-ops': { skip: ['AccessorProperty'] },
};

/**
 * Match a Stylistic rule to the syntax covered by its typescript-eslint source rule.
 * @param rule - Pinned Stylistic rule implementation.
 * @param coverage - Audited visitor differences for the rule.
 * @returns The rule itself, or a wrapper with the same metadata and the source rule's visitors.
 */
function matchCoverage(rule: CreateRule, coverage: Coverage | undefined): Rule {
    if (!coverage) {
        return rule;
    }
    const {
        skip = [],
        keep,
        reuse = {},
        adapt,
        exempt,
    } = coverage;
    return {
        meta: rule.meta,
        create(context) {
            const adapted = adapt ? adapt(context) : context;
            const visitor: Visitor = { ...rule.create(adapted) };
            for (const node of skip) {
                if (!keep?.(adapted, node)) {
                    delete visitor[node];
                }
            }
            for (const [node, source] of Object.entries(reuse)) {
                if (!visitor[source]) {
                    throw new Error(`Missing pinned Stylistic visitor ${source} for ${node}.`);
                }
                visitor[node] = visitor[source];
            }
            if (exempt) {
                for (const node of exempt.nodes) {
                    const check = visitor[node] as Handler | undefined;
                    if (check) {
                        visitor[node] = (target: Node) => {
                            if (!exempt.when(adapted, target)) {
                                check(target);
                            }
                        };
                    }
                }
            }
            return visitor;
        },
    } satisfies Rule;
}

const rules: Record<string, Rule> = Object.fromEntries(RULE_NAMES.map((name) => {
    const rule = plugin.rules[name];
    if (!rule) {
        throw new Error(`Missing pinned Stylistic rule ${name}.`);
    }
    return [name, matchCoverage(rule as unknown as CreateRule, COVERAGE[name])];
}));

export default definePlugin({ meta: { name: 'ag-ts-style' }, rules });
