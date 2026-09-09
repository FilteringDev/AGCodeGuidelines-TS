import type { LegacyRule, Node } from '../../types';
/**
 * @file Enforce ES5 or ES6 class for React Components
 * @author Dan Hamilton
 */
import dependency0 from '../util/componentUtil';
import dependency1 from '../util/docsUrl';
import dependency2 from '../util/report';

const componentUtil = dependency0;
const docsUrl = dependency1;
const report = dependency2;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    shouldUseES6Class: 'Component should use es6 class instead of createClass',
    shouldUseCreateClass: 'Component should use createClass instead of es6 class',
};

const rule: LegacyRule<[('always' | 'never')?]> = {
    meta: {
        docs: {
            description: 'Enforce ES5 or ES6 class for React Components',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('prefer-es6-class'),
        },

        messages,

        schema: [
            {
                enum: ['always', 'never'],
            },
        ],
    },

    create(context) {
        const configuration = context.options[0] || 'always';

        return {
            ObjectExpression(node: Node<'ObjectExpression'>) {
                if (componentUtil.isES5Component(node, context) && configuration === 'always') {
                    report(context, messages.shouldUseES6Class, 'shouldUseES6Class', {
                        node,
                    });
                }
            },
            ClassDeclaration(node: Node<'ClassDeclaration'>) {
                if (componentUtil.isES6Component(node, context) && configuration === 'never') {
                    report(context, messages.shouldUseCreateClass, 'shouldUseCreateClass', {
                        node,
                    });
                }
            },
        };
    },
};

export default rule;
