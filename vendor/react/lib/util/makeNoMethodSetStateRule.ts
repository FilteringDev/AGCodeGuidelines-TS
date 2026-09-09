/**
 * @file Prevent usage of setState in lifecycle methods
 * @author Yannick Croissant
 */
import dependency0 from 'array.prototype.findlast';
import dependency1 from './docsUrl';
import dependency2 from './report';
import dependency3 from './eslint';
import dependency4 from './version';
import type { Node, RuleContext, LegacyRule } from '../../types';

const findLast = dependency0;

const docsUrl = dependency1;
const report = dependency2;
const { getAncestors } = dependency3;
const { testReactVersion } = dependency4;

// ------------------------------------------------------------------------------
// Rule Definition
// ------------------------------------------------------------------------------

/**
 * @param methodName The method name value.
 * @returns The result of this check.
 */
function mapTitle(methodName: string) {
    const map: Record<string, string> = {
        componentDidMount: 'did-mount',
        componentDidUpdate: 'did-update',
        componentWillUpdate: 'will-update',
    };
    const title = map[methodName];
    if (!title) {
        throw Error(`No docsUrl for '${methodName}'`);
    }
    return `no-${title}-set-state`;
}

const messages = {
    noSetState: 'Do not use setState in {{name}}',
};

const methodNoopsAsOf: Record<string, string> = {
    componentDidMount: '>= 16.3.0',
    componentDidUpdate: '>= 16.3.0',
};

/**
 * @param context The rule context.
 * @param methodName The method name value.
 * @returns The result of this check.
 */
function shouldBeNoop(context: RuleContext, methodName: string) {
    return (
        methodName in methodNoopsAsOf
        && testReactVersion(context, methodNoopsAsOf[methodName]!)
        && !testReactVersion(context, '999.999.999')
    ); // for when the version is not specified
}

/**
 * @param methodName The value to inspect.
 * @param [shouldCheckUnsafeCb] The value to inspect.
 * @returns The result of this check.
 */
export default function makeNoMethodSetStateRule(
    methodName: string,
    shouldCheckUnsafeCb?: (context: RuleContext) => boolean,
): LegacyRule<['disallow-in-func'?]> {
    return {
        meta: {
            docs: {
                description: `Disallow usage of setState in ${methodName}`,
                category: 'Best Practices',
                recommended: false,
                url: docsUrl(mapTitle(methodName)),
            },

            messages,

            schema: [
                {
                    enum: ['disallow-in-func'],
                },
            ],
        },

        create(context: RuleContext) {
            const mode = context.options[0] || 'allow-in-func';

            /**
             * @returns The result of this check.
             * @param name The name to inspect.
             */
            function nameMatches(name: unknown) {
                if (name === methodName) {
                    return true;
                }

                if (typeof shouldCheckUnsafeCb === 'function' && shouldCheckUnsafeCb(context)) {
                    return name === `UNSAFE_${methodName}`;
                }

                return false;
            }

            if (shouldBeNoop(context, methodName)) {
                return {};
            }

            // --------------------------------------------------------------------------
            // Public
            // --------------------------------------------------------------------------

            return {
                CallExpression(node: Node<'CallExpression'>) {
                    const { callee } = node;
                    if (
                        callee.type !== 'MemberExpression'
                        || callee.object.type !== 'ThisExpression'
                        || !('name' in callee.property)
                        || callee.property.name !== 'setState'
                    ) {
                        return;
                    }
                    const ancestors = getAncestors(context, node);
                    let depth = 0;
                    findLast(ancestors, (ancestor) => {
                        // ancestors.some((ancestor) => {
                        if (/Function(Expression|Declaration)$/.test(ancestor.type)) {
                            depth += 1;
                        }
                        if (
                            (ancestor.type !== 'Property'
                                && ancestor.type !== 'MethodDefinition'
                                && ancestor.type !== 'ClassProperty'
                                && ancestor.type !== 'PropertyDefinition')
                            || !nameMatches(ancestor.key.name)
                            || (mode !== 'disallow-in-func' && depth > 1)
                        ) {
                            return false;
                        }
                        report(context, messages.noSetState, 'noSetState', {
                            node: callee,
                            data: {
                                name: ancestor.key.name,
                            },
                        });
                        return true;
                    });
                },
            };
        },
    };
}
