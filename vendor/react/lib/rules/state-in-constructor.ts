import type { LegacyRule, Node } from '../../types';
/**
 * @file Enforce the state initialization style to be either in a constructor or with a class property
 * @author Kanitkorn Sujautra
 */
import dependency0 from '../util/ast';
import dependency1 from '../util/componentUtil';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/report';

const astUtil = dependency0;
const componentUtil = dependency1;
const docsUrl = dependency2;
const report = dependency3;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    stateInitConstructor: 'State initialization should be in a constructor',
    stateInitClassProp: 'State initialization should be in a class property',
};

const rule: LegacyRule<[('always' | 'never')?]> = {
    meta: {
        docs: {
            description: 'Enforce class component state initialization style',
            category: 'Stylistic Issues',
            recommended: false,
            url: docsUrl('state-in-constructor'),
        },

        messages,

        schema: [
            {
                enum: ['always', 'never'],
            },
        ],
    },

    create(context) {
        const option = context.options[0] || 'always';
        return {
            'ClassProperty, PropertyDefinition': function onClassPropertyPropertyDefinition(
                node: Node<'ClassProperty' | 'PropertyDefinition'>,
            ) {
                if (
                    option === 'always'
                    && !node.static
                    && node.key.name === 'state'
                    && componentUtil.getParentES6Component(context, node)
                ) {
                    report(context, messages.stateInitConstructor, 'stateInitConstructor', {
                        node,
                    });
                }
            },
            AssignmentExpression(node: Node<'AssignmentExpression'>) {
                if (
                    option === 'never'
                    && componentUtil.isStateMemberExpression(node.left)
                    && astUtil.inConstructor(context, node)
                    && componentUtil.getParentES6Component(context, node)
                ) {
                    report(context, messages.stateInitClassProp, 'stateInitClassProp', {
                        node,
                    });
                }
            },
        };
    },
};

export default rule;
