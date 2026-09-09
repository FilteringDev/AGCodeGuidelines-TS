import dependency0 from 'object.entries';
import type { LegacyRule, Node } from '../../types';
/**
 * @file Prevent usage of deprecated methods
 * @author Yannick Croissant
 * @author Scott Feeney
 * @author Sergei Startsev
 */
import dependency1 from '../util/ast';
import dependency2 from '../util/componentUtil';
import dependency3 from '../util/docsUrl';
import dependency4 from '../util/pragma';
import dependency5 from '../util/version';
import dependency6 from '../util/report';
import dependency7 from '../util/eslint';

const entries = dependency0;
const astUtil = dependency1;
const componentUtil = dependency2;
const docsUrl = dependency3;
const pragmaUtil = dependency4;
const { testReactVersion } = dependency5;
const report = dependency6;
const { getText } = dependency7;

// ------------------------------------------------------------------------------
// Constants
// ------------------------------------------------------------------------------

const MODULES: Record<string, string[]> = {
    react: ['React'],
    'react-addons-perf': ['ReactPerf', 'Perf'],
    'react-dom': ['ReactDOM'],
    'react-dom/server': ['ReactDOMServer'],
};

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/**
 * @param pragma The pragma value.
 * @returns The result of this check.
 */
function getDeprecated(pragma: string) {
    const deprecated: Record<string, [version: string, replacement?: string, reference?: string]> = {};
    // 0.12.0
    deprecated[`${pragma}.renderComponent`] = ['0.12.0', `${pragma}.render`];
    deprecated[`${pragma}.renderComponentToString`] = ['0.12.0', `${pragma}.renderToString`];
    deprecated[`${pragma}.renderComponentToStaticMarkup`] = ['0.12.0', `${pragma}.renderToStaticMarkup`];
    deprecated[`${pragma}.isValidComponent`] = ['0.12.0', `${pragma}.isValidElement`];
    deprecated[`${pragma}.PropTypes.component`] = ['0.12.0', `${pragma}.PropTypes.element`];
    deprecated[`${pragma}.PropTypes.renderable`] = ['0.12.0', `${pragma}.PropTypes.node`];
    deprecated[`${pragma}.isValidClass`] = ['0.12.0'];
    deprecated['this.transferPropsTo'] = ['0.12.0', 'spread operator ({...})'];
    // 0.13.0
    deprecated[`${pragma}.addons.classSet`] = ['0.13.0', 'the npm module classnames'];
    deprecated[`${pragma}.addons.cloneWithProps`] = ['0.13.0', `${pragma}.cloneElement`];
    // 0.14.0
    deprecated[`${pragma}.render`] = ['0.14.0', 'ReactDOM.render'];
    deprecated[`${pragma}.unmountComponentAtNode`] = ['0.14.0', 'ReactDOM.unmountComponentAtNode'];
    deprecated[`${pragma}.findDOMNode`] = ['0.14.0', 'ReactDOM.findDOMNode'];
    deprecated[`${pragma}.renderToString`] = ['0.14.0', 'ReactDOMServer.renderToString'];
    deprecated[`${pragma}.renderToStaticMarkup`] = ['0.14.0', 'ReactDOMServer.renderToStaticMarkup'];
    // 15.0.0
    deprecated[`${pragma}.addons.LinkedStateMixin`] = ['15.0.0'];
    deprecated['ReactPerf.printDOM'] = ['15.0.0', 'ReactPerf.printOperations'];
    deprecated['Perf.printDOM'] = ['15.0.0', 'Perf.printOperations'];
    deprecated['ReactPerf.getMeasurementsSummaryMap'] = ['15.0.0', 'ReactPerf.getWasted'];
    deprecated['Perf.getMeasurementsSummaryMap'] = ['15.0.0', 'Perf.getWasted'];
    // 15.5.0
    deprecated[`${pragma}.createClass`] = ['15.5.0', 'the npm module create-react-class'];
    deprecated[`${pragma}.addons.TestUtils`] = ['15.5.0', 'ReactDOM.TestUtils'];
    deprecated[`${pragma}.PropTypes`] = ['15.5.0', 'the npm module prop-types'];
    // 15.6.0
    deprecated[`${pragma}.DOM`] = ['15.6.0', 'the npm module react-dom-factories'];
    // 16.9.0
    // For now the following life-cycle methods are just legacy, not deprecated:
    // `componentWillMount`, `componentWillReceiveProps`, `componentWillUpdate`
    // https://github.com/yannickcr/eslint-plugin-react/pull/1750#issuecomment-425975934
    deprecated.componentWillMount = [
        '16.9.0',
        'UNSAFE_componentWillMount',
        'https://reactjs.org/docs/react-component.html#unsafe_componentwillmount. '
            + 'Use https://github.com/reactjs/react-codemod#rename-unsafe-lifecycles to automatically update your components.',
    ];
    deprecated.componentWillReceiveProps = [
        '16.9.0',
        'UNSAFE_componentWillReceiveProps',
        'https://reactjs.org/docs/react-component.html#unsafe_componentwillreceiveprops. '
            + 'Use https://github.com/reactjs/react-codemod#rename-unsafe-lifecycles to automatically update your components.',
    ];
    deprecated.componentWillUpdate = [
        '16.9.0',
        'UNSAFE_componentWillUpdate',
        'https://reactjs.org/docs/react-component.html#unsafe_componentwillupdate. '
            + 'Use https://github.com/reactjs/react-codemod#rename-unsafe-lifecycles to automatically update your components.',
    ];
    // 18.0.0
    // https://reactjs.org/blog/2022/03/08/react-18-upgrade-guide.html#deprecations
    deprecated['ReactDOM.render'] = [
        '18.0.0',
        'createRoot',
        'https://reactjs.org/link/switch-to-createroot',
    ];
    deprecated['ReactDOM.hydrate'] = [
        '18.0.0',
        'hydrateRoot',
        'https://reactjs.org/link/switch-to-createroot',
    ];
    deprecated['ReactDOM.unmountComponentAtNode'] = [
        '18.0.0',
        'root.unmount',
        'https://reactjs.org/link/switch-to-createroot',
    ];
    deprecated['ReactDOMServer.renderToNodeStream'] = [
        '18.0.0',
        'renderToPipeableStream',
        'https://reactjs.org/docs/react-dom-server.html#rendertonodestream',
    ];

    return deprecated;
}

const messages = {
    deprecated: '{{oldMethod}} is deprecated since React {{version}}{{newMethod}}{{refs}}',
};

const rule: LegacyRule<[]> = {
    meta: {
        docs: {
            description: 'Disallow usage of deprecated methods',
            category: 'Best Practices',
            recommended: true,
            url: docsUrl('no-deprecated'),
        },

        messages,

        schema: [],
    },

    create(context) {
        const pragma = pragmaUtil.getFromContext(context);
        const deprecated = getDeprecated(pragma);

        /**
         * @returns The result of this check.
         * @param method The method value.
         */
        function isDeprecated(method: string | false | undefined) {
            return (
                deprecated
                && deprecated[method as string]!
                && deprecated[method as string]![0]
                && testReactVersion(context, `>= ${deprecated[method as string]![0]}`)
            );
        }

        /**
         * @param node The node to inspect.
         * @param methodName The method name value.
         * @param methodNode The method node value.
         */
        function checkDeprecation(
            node: Node,
            methodName: string | false | undefined,
            methodNode?: Node | null,
        ) {
            if (!isDeprecated(methodName)) {
                return;
            }
            const version = deprecated[methodName as string]![0];
            const newMethod = deprecated[methodName as string]![1];
            const refs = deprecated[methodName as string]![2];
            report(context, messages.deprecated, 'deprecated', {
                node: methodNode || node,
                data: {
                    oldMethod: methodName,
                    version,
                    newMethod: newMethod ? `, use ${newMethod} instead` : '',
                    refs: refs ? `, see ${refs}` : '',
                },
            });
        }

        /**
         * @returns The result of this check.
         * @param node The node to inspect.
         */
        function getReactModuleName(node: Node) {
            let moduleName: string | false | undefined = false;
            if (!node.init) {
                return false;
            }

            entries(MODULES).some((entry) => {
                const key = entry[0];
                const moduleNames = entry[1];
                if (
                    node.init!.arguments
                    && node.init!.arguments.length > 0
                    && node.init!.arguments[0]
                    && key === node.init!.arguments[0].value
                ) {
                    [moduleName] = MODULES[key]!;
                } else {
                    moduleName = moduleNames.find((name) => name === node.init!.name);
                }
                return moduleName;
            });

            return moduleName;
        }

        /**
         * Returns life cycle methods if available
         * @param node The AST node being checked.
         * @returns The array of methods.
         */
        function getLifeCycleMethods(node: Node) {
            const properties = astUtil.getComponentProperties(node);
            return properties.map((property) => ({
                name: astUtil.getPropertyName(property),
                node: astUtil.getPropertyNameNode(property),
            }));
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
                methods.forEach((method) => checkDeprecation(node, method.name, method.node));
            }
        }

        // --------------------------------------------------------------------------
        // Public
        // --------------------------------------------------------------------------

        return {
            MemberExpression(node: Node<'MemberExpression'>) {
                checkDeprecation(node, getText(context, node));
            },

            ImportDeclaration(node: Node<'ImportDeclaration'>) {
                const isReactImport = typeof MODULES[node.source.value] !== 'undefined';
                if (!isReactImport) {
                    return;
                }
                node.specifiers
                    .filter((s) => 'imported' in s && s.imported)
                    .forEach((specifier) => {
                        // TODO, semver-major: remove `in` check as part of jsdoc->tsdoc migration
                        checkDeprecation(
                            node,
                            'imported' in specifier
                                && 'name' in specifier.imported!
                                && `${MODULES[node.source.value]![0]}.${specifier.imported.name}`,
                            specifier,
                        );
                    });
            },

            VariableDeclarator(node: Node<'VariableDeclarator'>) {
                const reactModuleName = getReactModuleName(node);
                const isRequire = node.init
                    && 'callee' in node.init
                    && node.init.callee
                    && 'name' in node.init.callee
                    && node.init.callee.name === 'require';
                const isReactRequire = node.init
                    && 'arguments' in node.init
                    && node.init.arguments
                    && node.init.arguments.length
                    && typeof MODULES[
                        ('value' in node.init.arguments[0]!
                            ? node.init.arguments[0].value
                            : undefined) as string
                    ] !== 'undefined';
                const isDestructuring = node.id && node.id.type === 'ObjectPattern';

                if (
                    !(isDestructuring && reactModuleName)
                    && !(isDestructuring && isRequire && isReactRequire)
                ) {
                    return;
                }

                ('properties' in node.id ? node.id.properties : undefined)!
                    .filter((p) => p.type !== 'RestElement' && p.key)
                    .forEach((property) => {
                        checkDeprecation(
                            node,
                            'key' in property
                                && 'name' in property.key!
                                && `${reactModuleName || pragma}.${property.key.name}`,
                            property,
                        );
                    });
            },

            ClassDeclaration: checkLifeCycleMethods,
            ClassExpression: checkLifeCycleMethods,
            ObjectExpression: checkLifeCycleMethods,
        };
    },
};

export default rule;
