import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent usage of the return value of React.render
 * @author Dustan Kasten
 */
import dependency0 from '../util/version';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/report';

const { testReactVersion } = dependency0;
const docsUrl = dependency1;
const report = dependency2;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    noReturnValue: 'Do not depend on the return value from {{node}}.render',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow usage of the return value of ReactDOM.render',
            category: 'Best Practices',
            recommended: true,
            url: docsUrl('no-render-return-value'),
        },

        messages,

        schema: [],
    },

    create(context) {
        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        let calleeObjectName = /^ReactDOM$/;
        if (testReactVersion(context, '>= 15.0.0')) {
            calleeObjectName = /^ReactDOM$/;
        } else if (testReactVersion(context, '^0.14.0')) {
            calleeObjectName = /^React(DOM)?$/;
        } else if (testReactVersion(context, '^0.13.0')) {
            calleeObjectName = /^React$/;
        }

        return {
            CallExpression(node: Node<'CallExpression'>) {
                const { callee } = node;
                const { parent } = node;
                if (callee.type !== 'MemberExpression') {
                    return;
                }

                if (
                    callee.object.type !== 'Identifier'
                    || !calleeObjectName.test(callee.object.name)
                    || !('name' in callee.property)
                    || callee.property.name !== 'render'
                ) {
                    return;
                }

                if (
                    parent.type === 'VariableDeclarator'
                    || parent.type === 'Property'
                    || parent.type === 'ReturnStatement'
                    || parent.type === 'ArrowFunctionExpression'
                    || parent.type === 'AssignmentExpression'
                ) {
                    report(context, messages.noReturnValue, 'noReturnValue', {
                        node: callee,
                        data: {
                            node: callee.object.name,
                        },
                    });
                }
            },
        };
    },
};

export default rule;
