import dependency0 from 'object.values';
import type { Node, RuleContext, LegacyRule } from '../../types';

/**
 * @file Prevent usage of referential-type variables as default param in functional component
 * @author Chang Yan
 */
import dependency1 from '../util/Components';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/ast';
import dependency4 from '../util/report';

const values = dependency0;

const Components = dependency1;
const docsUrl = dependency2;
const astUtil = dependency3;
const report = dependency4;

const FORBIDDEN_TYPES_MAP = {
    ArrowFunctionExpression: 'arrow function',
    FunctionExpression: 'function expression',
    ObjectExpression: 'object literal',
    ArrayExpression: 'array literal',
    ClassExpression: 'class expression',
    NewExpression: 'construction expression',
    JSXElement: 'JSX element',
};

const FORBIDDEN_TYPES = new Set(Object.keys(FORBIDDEN_TYPES_MAP));
const MESSAGE_ID = 'forbiddenTypeDefaultParam';

const messages = {
    [MESSAGE_ID]:
        '{{propName}} has a/an {{forbiddenType}} as default prop. This could lead to potential infinite render loop in React. Use a variable reference instead of {{forbiddenType}}.',
};
/**
 * @param params The params value.
 * @returns The result of this check.
 */
function hasUsedObjectDestructuringSyntax(params: Node[] | undefined) {
    return params != null && params.length >= 1 && params[0]!.type === 'ObjectPattern';
}

/**
 * @param context The rule context.
 * @param properties The properties value.
 */
function verifyDefaultPropsDestructuring(context: RuleContext, properties: Node[]) {
    // Loop through each of the default params
    properties
        .filter(
            (prop): prop is Node<'Property'> & { value: Node<'AssignmentPattern'> } => prop.type === 'Property'
&& prop.value.type === 'AssignmentPattern',
        )
        .forEach((prop) => {
            const propName = prop.key.name;
            const propDefaultValue = prop.value;

            const propDefaultValueType = propDefaultValue.right.type;

            if (propDefaultValueType === 'Literal' && propDefaultValue.right.regex != null) {
                report(context, messages[MESSAGE_ID], MESSAGE_ID, {
                    node: propDefaultValue,
                    data: {
                        propName,
                        forbiddenType: 'regex literal',
                    },
                });
            } else if (
                astUtil.isCallExpression(propDefaultValue.right)
                && propDefaultValue.right.callee.type === 'Identifier'
                && propDefaultValue.right.callee.name === 'Symbol'
            ) {
                report(context, messages[MESSAGE_ID], MESSAGE_ID, {
                    node: propDefaultValue,
                    data: {
                        propName,
                        forbiddenType: 'Symbol literal',
                    },
                });
            } else if (FORBIDDEN_TYPES.has(propDefaultValueType)) {
                report(context, messages[MESSAGE_ID], MESSAGE_ID, {
                    node: propDefaultValue,
                    data: {
                        propName,
                        forbiddenType:
                            FORBIDDEN_TYPES_MAP[
                                propDefaultValueType as keyof typeof FORBIDDEN_TYPES_MAP
                            ],
                    },
                });
            }
        });
}

const rule: LegacyRule = {
    meta: {
        docs: {
            description:
                'Disallow usage of referential-type variables as default param in functional component',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('no-object-type-as-default-prop'),
        },
        messages,
    },
    create: Components.detect((context, components) => ({
        'Program:exit': function onProgramExit() {
            const list = components.list();
            values(list)
                .filter((component) => hasUsedObjectDestructuringSyntax(component.node.params))
                .forEach((component) => {
                    const { node } = component;
                    const { properties } = node.params![0]!;
                    verifyDefaultPropsDestructuring(context, properties!);
                });
        },
    })),
};

export default rule;
