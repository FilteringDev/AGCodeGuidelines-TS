import type { Scope, LegacyRule, Node } from '../../types';
/**
 * @file Disallow undeclared variables in JSX
 * @author Yannick Croissant
 */
import dependency0 from '../util/docsUrl';
import dependency1 from '../util/eslint';
import dependency2 from '../util/jsx';
import dependency3 from '../util/report';

const docsUrl = dependency0;
const eslintUtil = dependency1;
const jsxUtil = dependency2;
const report = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    undefined: "'{{identifier}}' is not defined.",
};

const rule: LegacyRule<[{ allowGlobals?: boolean }?]> = {
    meta: {
        docs: {
            description: 'Disallow undeclared variables in JSX',
            category: 'Possible Errors',
            recommended: true,
            url: docsUrl('jsx-no-undef'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    allowGlobals: {
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const config = context.options[0] || {};
        const allowGlobals = config.allowGlobals || false;

        /**
         * Compare an identifier with the variables declared in the scope
         * @param node - Identifier or JSXIdentifier node
         */
        function checkIdentifierInJSX(node: Node<'Identifier' | 'JSXIdentifier'>) {
            let scope: Scope = eslintUtil.getScope(context, node);
            const sourceCode = eslintUtil.getSourceCode(context);
            const { sourceType } = sourceCode.ast;
            const scopeUpperBound = !allowGlobals && sourceType === 'module' ? 'module' : 'global';
            let { variables } = scope;
            let i;
            let len;

            // Ignore 'this' keyword (also maked as JSXIdentifier when used in JSX)
            if (node.name === 'this') {
                return;
            }

            while (scope.type !== scopeUpperBound && scope.type !== 'global') {
                scope = scope.upper!;
                variables = scope.variables.concat(variables);
            }
            if (scope.childScopes.length) {
                variables = scope.childScopes[0]!.variables.concat(variables);
                // Temporary fix for babel-eslint
                if (scope.childScopes[0]!.childScopes.length) {
                    variables = scope.childScopes[0]!.childScopes[0]!.variables.concat(variables);
                }
            }

            for (i = 0, len = variables.length; i < len; i += 1) {
                if (variables[i]!.name === node.name) {
                    return;
                }
            }

            report(context, messages.undefined, 'undefined', {
                node,
                data: {
                    identifier: node.name,
                },
            });
        }

        return {
            JSXOpeningElement(element: Node<'JSXOpeningElement'>) {
                let node: Node = element;
                switch (element.name.type) {
                    case 'JSXIdentifier':
                        if (jsxUtil.isDOMComponent(node)) {
                            return;
                        }
                        node = element.name;
                        break;
                    case 'JSXMemberExpression':
                        node = element.name;
                        do {
                            node = node.object!;
                        } while (node && node.type !== 'JSXIdentifier');
                        break;
                    case 'JSXNamespacedName':
                        return;
                    default:
                        break;
                }
                checkIdentifierInJSX(node as Node<'JSXIdentifier'>);
            },
        };
    },
};

export default rule;
