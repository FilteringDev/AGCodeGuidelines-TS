import { CALL, CONSTRUCT } from '@eslint-community/eslint-utils';
/**
 * @file Rule to flag use of an object property of the global object (Math and JSON) as a function
 * @author James Allardice
 */
import dependency0 from '../../compat/eslint-utils';
import dependency1 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const { ReferenceTracker } = dependency0;
const getPropertyName = dependency1.getStaticPropertyName;

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

const nonCallableGlobals = ['Atomics', 'JSON', 'Math', 'Reflect', 'Intl'];

/**
 * Returns the name of the node to report
 * @param node A node to report
 * @returns name to report
 */
function getReportNodeName(node: Node) {
    if (node.type === 'ChainExpression') {
        return getReportNodeName(node.expression);
    }
    if (node.type === 'MemberExpression') {
        return getPropertyName(node);
    }
    return node.name;
}

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow calling global object properties as functions',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-obj-calls',
        },

        schema: [],

        messages: {
            unexpectedCall: "'{{name}}' is not a function.",
            unexpectedRefCall: "'{{name}}' is reference to '{{ref}}', which is not a function.",
        },
    },

    create(context) {
        const { sourceCode } = context;

        return {
            Program(node: Node<'Program'>) {
                const scope = sourceCode.getScope(node);
                const tracker = new ReferenceTracker(scope);
                const traceMap: Record<string, { [CALL]: true; [CONSTRUCT]: true }> = {};

                nonCallableGlobals.forEach((g) => {
                    traceMap[g] = {
                        [CALL]: true,
                        [CONSTRUCT]: true,
                    };
                });

                Array.from(tracker.iterateGlobalReferences(traceMap)).forEach(
                    ({ node: refNode, path }) => {
                        const name = getReportNodeName(refNode.callee);
                        const ref = path[0];
                        const messageId = name === ref ? 'unexpectedCall' : 'unexpectedRefCall';

                        context.report({ node: refNode, messageId, data: { name, ref } });
                    },
                );
            },
        };
    },
};

export default rule;
