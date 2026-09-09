import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent usage of unsafe lifecycle methods
 * @author Sergei Startsev
 */
import dependency0 from '../util/ast';
import dependency1 from '../util/componentUtil';
import dependency2 from '../util/docsUrl';
import dependency3 from '../util/version';
import dependency4 from '../util/report';

const astUtil = dependency0;
const componentUtil = dependency1;
const docsUrl = dependency2;
const { testReactVersion } = dependency3;
const report = dependency4;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

const messages = {
    unsafeMethod:
        '{{method}} is unsafe for use in async rendering. Update the component to use {{newMethod}} instead. {{details}}',
};

const rule: LegacyRule<[{ checkAliases?: boolean }?]> = {
    meta: {
        docs: {
            description: 'Disallow usage of unsafe lifecycle methods',
            category: 'Best Practices',
            recommended: false,
            url: docsUrl('no-unsafe'),
        },

        messages,

        schema: [
            {
                type: 'object',
                properties: {
                    checkAliases: {
                        default: false,
                        type: 'boolean',
                    },
                },
                additionalProperties: false,
            },
        ],
    },

    create(context) {
        const config = context.options[0] || {};
        const checkAliases = config.checkAliases || false;

        const isApplicable = testReactVersion(context, '>= 16.3.0');
        if (!isApplicable) {
            return {};
        }

        const unsafe: Record<string, { newMethod: string; details: string }> = {
            UNSAFE_componentWillMount: {
                newMethod: 'componentDidMount',
                details: 'See https://reactjs.org/blog/2018/03/27/update-on-async-rendering.html.',
            },
            UNSAFE_componentWillReceiveProps: {
                newMethod: 'getDerivedStateFromProps',
                details: 'See https://reactjs.org/blog/2018/03/27/update-on-async-rendering.html.',
            },
            UNSAFE_componentWillUpdate: {
                newMethod: 'componentDidUpdate',
                details: 'See https://reactjs.org/blog/2018/03/27/update-on-async-rendering.html.',
            },
        };
        if (checkAliases) {
            unsafe.componentWillMount = unsafe.UNSAFE_componentWillMount!;
            unsafe.componentWillReceiveProps = unsafe.UNSAFE_componentWillReceiveProps!;
            unsafe.componentWillUpdate = unsafe.UNSAFE_componentWillUpdate!;
        }

        /**
         * Returns a list of unsafe methods
         * @returns A list of unsafe methods
         */
        function getUnsafeMethods() {
            return Object.keys(unsafe);
        }

        /**
         * Checks if a passed method is unsafe
         * @param method Life cycle method
         * @returns Returns true for unsafe methods, otherwise returns false
         */
        function isUnsafe(method: string) {
            const unsafeMethods = getUnsafeMethods();
            return unsafeMethods.indexOf(method) !== -1;
        }

        /**
         * Reports the error for an unsafe method
         * @param node The AST node being checked
         * @param method Life cycle method
         */
        function checkUnsafe(node: Node, method: string) {
            if (!isUnsafe(method)) {
                return;
            }

            const meta = unsafe[method]!;
            const { newMethod } = meta;
            const { details } = meta;

            const propertyNode = astUtil
                .getComponentProperties(node)
                .find((property) => astUtil.getPropertyName(property) === method);

            report(context, messages.unsafeMethod, 'unsafeMethod', {
                node: propertyNode!,
                data: {
                    method,
                    newMethod,
                    details,
                },
            });
        }

        /**
         * Returns life cycle methods if available
         * @param node The AST node being checked.
         * @returns The array of methods.
         */
        function getLifeCycleMethods(node: Node) {
            const properties = astUtil.getComponentProperties(node);
            return properties.map((property) => astUtil.getPropertyName(property));
        }

        /**
         * Checks life cycle methods
         * @param node The AST node being checked.
         */
        function checkLifeCycleMethods(node: Node) {
            if (
                componentUtil.isES5Component(node, context)
                || componentUtil.isES6Component(node, context)
            ) {
                const methods = getLifeCycleMethods(node);
                methods
                    .sort((a, b) => a!.localeCompare(b!))
                    .forEach((method) => checkUnsafe(node, method!));
            }
        }

        return {
            ClassDeclaration: checkLifeCycleMethods,
            ClassExpression: checkLifeCycleMethods,
            ObjectExpression: checkLifeCycleMethods,
        };
    },
};

export default rule;
