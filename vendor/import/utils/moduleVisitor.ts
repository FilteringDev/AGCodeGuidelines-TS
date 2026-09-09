import type { JSONSchema4 } from 'json-schema';
import enumerableKeys from './enumerableKeys';
import type { ModuleSource, Node, ModuleVisitorOptions } from '../types';

/**
 * Returns an object of node visitors that will call
 * 'visitor' with every discovered module path.
 * @param visitor The visitor value.
 * @param [options] The configured rule options.
 * @returns The result of this check.
 */
export default function visitModules(
    visitor: (source: ModuleSource, importer: Node) => void,
    options?: ModuleVisitorOptions,
) {
    const ignore = options && options.ignore;
    const amd = !!(options && options.amd);
    const commonjs = !!(options && options.commonjs);
    // if esmodule is not explicitly disabled, it is assumed to be enabled
    const esmodule = !!{ esmodule: true, ...options }.esmodule;

    const ignoreRegExps = ignore == null ? [] : ignore.map((p) => new RegExp(p));

    /**
     * Check source value.
     * @param source The source text.
     * @param importer The importer value.
     */
    function checkSourceValue(source: ModuleSource | null | undefined, importer: Node) {
        if (source == null) {
            return;
        } // ?

        // handle ignore
        if (ignoreRegExps.some((re) => re.test(String(source.value)))) {
            return;
        }

        // fire visitor
        visitor(source, importer);
    }

    // for import-y declarations

    /**
     * Check source.
     * @param node The node to inspect.
     */
    function checkSource(node: Node) {
        checkSourceValue(node.source as ModuleSource | null | undefined, node);
    }

    // for esmodule dynamic `import()` calls

    /**
     * Check import call.
     * @param node The node to inspect.
     */
    function checkImportCall(node: Node) {
        let modulePath;
        // refs https://github.com/estree/estree/blob/HEAD/es2020.md#importexpression
        if (node.type === 'ImportExpression') {
            modulePath = node.source;
        } else if (node.type === 'CallExpression') {
            if (node.callee.type !== 'Import') {
                return;
            }
            if (node.arguments.length !== 1) {
                return;
            }

            [modulePath] = node.arguments;
        } else {
            throw new TypeError('this should be unreachable');
        }

        if (modulePath!.type !== 'Literal') {
            return;
        }
        if (typeof modulePath!.value !== 'string') {
            return;
        }

        checkSourceValue(modulePath as ModuleSource, node);
    }

    // for CommonJS `require` calls
    // adapted from @mctep: https://git.io/v4rAu

    /**
     * Check common.
     * @param call The call value.
     */
    function checkCommon(call: Node) {
        if (call.callee!.type !== 'Identifier') {
            return;
        }
        if (call.callee!.name !== 'require') {
            return;
        }
        if (call.arguments!.length !== 1) {
            return;
        }

        const modulePath = call.arguments![0];
        if (modulePath!.type !== 'Literal') {
            return;
        }
        if (typeof modulePath!.value !== 'string') {
            return;
        }

        checkSourceValue(modulePath as ModuleSource, call);
    }

    /**
     * Check amd.
     * @param call The call value.
     */
    function checkAMD(call: Node) {
        if (call.callee!.type !== 'Identifier') {
            return;
        }
        if (call.callee!.name !== 'require' && call.callee!.name !== 'define') {
            return;
        }
        if (call.arguments!.length !== 2) {
            return;
        }

        const modules = call.arguments![0];
        if (modules!.type !== 'ArrayExpression') {
            return;
        }

        const entryIterator0 = modules!.elements![Symbol.iterator]();
        for (
            let entryStep1 = entryIterator0.next();
            !entryStep1.done;
            entryStep1 = entryIterator0.next()
        ) {
            const element = entryStep1.value;
            if (element) {
                if (!(element.type !== 'Literal')) {
                    if (!(typeof element.value !== 'string')) {
                        if (!(element.value === 'require' || element.value === 'exports')) {
                            checkSourceValue(element as ModuleSource, element);
                        }
                    }
                }
            }
        }
    }

    const visitors: Record<string, (node: Node) => void> = {};
    if (esmodule) {
        Object.assign(visitors, {
            ImportDeclaration: checkSource,
            ExportNamedDeclaration: checkSource,
            ExportAllDeclaration: checkSource,
            CallExpression: checkImportCall,
            ImportExpression: checkImportCall,
        });
    }

    if (commonjs || amd) {
        const currentCallExpression = visitors.CallExpression;
        visitors.CallExpression = function inspect(call: Node) {
            if (currentCallExpression) {
                currentCallExpression(call);
            }
            if (commonjs) {
                checkCommon(call);
            }
            if (amd) {
                checkAMD(call);
            }
        };
    }

    return visitors;
}

/**
 * make an options schema for the module visitor, optionally adding extra fields.
 * @param [additionalProperties] The additional properties value.
 * @returns The result of this check.
 */
function makeOptionsSchema(additionalProperties?: Record<string, JSONSchema4>): JSONSchema4 {
    const base: JSONSchema4 = {
        type: 'object',
        properties: {
            commonjs: { type: 'boolean' },
            amd: { type: 'boolean' },
            esmodule: { type: 'boolean' },
            ignore: {
                type: 'array',
                minItems: 1,
                items: { type: 'string' },
                uniqueItems: true,
            },
        },
        additionalProperties: false,
    };

    if (additionalProperties) {
        enumerableKeys(additionalProperties).forEach((key) => {
            base.properties![key] = additionalProperties[key]!;
        });
    }

    return base;
}
export { makeOptionsSchema };

/**
 * json schema object for options parameter. can be used to build rule options schema object.
 */
export const optionsSchema = makeOptionsSchema();
