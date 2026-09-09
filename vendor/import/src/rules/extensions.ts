import type { IOptions } from 'minimatch';
import path from 'node:path';
import minimatch from 'minimatch';
import type {
    LegacyRule, Node, RuleContext, ModuleSource,
} from '../../types';
import resolve from '../../utils/resolve';
import { isBuiltIn, isExternalModule, isScoped } from '../core/importType';
import moduleVisitor from '../../utils/moduleVisitor';
import docsUrl from '../docsUrl';

type Modifier = 'always' | 'ignorePackages' | 'never';
interface PathOverride {
    pattern: string;
    patternOptions?: IOptions;
    action: 'enforce' | 'ignore';
}
export interface ExtensionProperties {
    pattern?: Record<string, Modifier>;
    checkTypeImports?: boolean;
    ignorePackages?: boolean;
    pathGroupOverrides?: PathOverride[];
}
type ExtensionOptions =
    | [Modifier?, (ExtensionProperties | Record<string, Modifier>)?]
    | [ExtensionProperties | Record<string, Modifier>];
interface ResolvedProperties extends ExtensionProperties {
    defaultConfig: Modifier;
    pattern: Record<string, Modifier>;
    ignorePackages: boolean;
}
const enumValues = { enum: ['always', 'ignorePackages', 'never'] };
const patternProperties = {
    type: 'object',
    patternProperties: { '.*': enumValues },
};
const properties = {
    type: 'object',
    properties: {
        pattern: patternProperties,
        checkTypeImports: { type: 'boolean' },
        ignorePackages: { type: 'boolean' },
        pathGroupOverrides: {
            type: 'array',
            items: {
                type: 'object',
                properties: {
                    pattern: {
                        type: 'string',
                    },
                    patternOptions: {
                        type: 'object',
                    },
                    action: {
                        type: 'string',
                        enum: ['enforce', 'ignore'],
                    },
                },
                additionalProperties: false,
                required: ['pattern', 'action'],
            },
        },
    },
};

/**
 * Build properties.
 * @param context The rule context.
 * @returns The result of this check.
 */
function buildProperties(context: RuleContext<ExtensionOptions>) {
    const result: ResolvedProperties = {
        defaultConfig: 'never',
        pattern: {},
        ignorePackages: false,
    };

    context.options.forEach((option) => {
        // If this is a string, set defaultConfig to its value
        if (typeof option === 'string') {
            result.defaultConfig = option;
            return;
        }

        const obj = option as ExtensionProperties;

        // If this is not the new structure, transfer all props to result.pattern
        if (
            obj.pattern === undefined
            && obj.ignorePackages === undefined
            && obj.checkTypeImports === undefined
        ) {
            Object.assign(result.pattern, obj);
            return;
        }

        // If pattern is provided, transfer all props
        if (obj.pattern !== undefined) {
            Object.assign(result.pattern, obj.pattern);
        }

        // If ignorePackages is provided, transfer it to result
        if (obj.ignorePackages !== undefined) {
            result.ignorePackages = obj.ignorePackages;
        }

        if (obj.checkTypeImports !== undefined) {
            result.checkTypeImports = obj.checkTypeImports;
        }

        if (obj.pathGroupOverrides !== undefined) {
            result.pathGroupOverrides = obj.pathGroupOverrides;
        }
    });

    if (result.defaultConfig === 'ignorePackages') {
        result.defaultConfig = 'always';
        result.ignorePackages = true;
    }

    return result;
}

const rule: LegacyRule<ExtensionOptions> = {
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Style guide',
            description: 'Ensure consistent use of file extension within the import path.',
            url: docsUrl('extensions'),
        },

        schema: {
            anyOf: [
                {
                    type: 'array',
                    items: [enumValues],
                    additionalItems: false,
                },
                {
                    type: 'array',
                    items: [enumValues, properties],
                    additionalItems: false,
                },
                {
                    type: 'array',
                    items: [properties],
                    additionalItems: false,
                },
                {
                    type: 'array',
                    items: [patternProperties],
                    additionalItems: false,
                },
                {
                    type: 'array',
                    items: [enumValues, patternProperties],
                    additionalItems: false,
                },
            ],
        },
    },

    create(context) {
        const props = buildProperties(context);

        /**
         * Get modifier.
         * @param extension The extension value.
         * @returns The result of this check.
         */
        function getModifier(extension: string) {
            return props.pattern[extension] || props.defaultConfig;
        }

        /**
         * Is use of extension required.
         * @param extension The extension value.
         * @param isPackage The is package value.
         * @returns The result of this check.
         */
        function isUseOfExtensionRequired(extension: string, isPackage: boolean | '') {
            return getModifier(extension) === 'always' && (!props.ignorePackages || !isPackage);
        }

        /**
         * Is use of extension forbidden.
         * @param extension The extension value.
         * @returns The result of this check.
         */
        function isUseOfExtensionForbidden(extension: string) {
            return getModifier(extension) === 'never';
        }

        /**
         * Is resolvable without extension.
         * @param file The file value.
         * @returns The result of this check.
         */
        function isResolvableWithoutExtension(file: string) {
            const extension = path.extname(file);
            const fileWithoutExtension = file.slice(0, -extension.length);
            const resolvedFileWithoutExtension = resolve(fileWithoutExtension, context);

            return resolvedFileWithoutExtension === resolve(file, context);
        }

        /**
         * Is external root module.
         * @param file The file value.
         * @returns The result of this check.
         */
        function isExternalRootModule(file: string) {
            if (file === '.' || file === '..') {
                return false;
            }
            const slashCount = file.split('/').length - 1;

            if (slashCount === 0) {
                return true;
            }
            if (isScoped(file) && slashCount <= 1) {
                return true;
            }
            return false;
        }

        /**
         * Compute override action.
         * @param pathGroupOverrides The path group overrides value.
         * @param selectedPath The selected path value.
         * @returns The result of this check.
         */
        function computeOverrideAction(pathGroupOverrides: PathOverride[], selectedPath: string) {
            for (let i = 0, l = pathGroupOverrides.length; i < l; i += 1) {
                const { pattern, patternOptions, action } = pathGroupOverrides[i]!;
                if (minimatch(selectedPath, pattern, patternOptions || { nocomment: true })) {
                    return action;
                }
            }

            return undefined;
        }

        /**
         * Check file extension.
         * @param source The source text.
         * @param node The node to inspect.
         */
        function checkFileExtension(source: ModuleSource | null | undefined, node: Node) {
            // bail if the declaration doesn't have a source, e.g. "export { foo };", or if it's only partially typed
            // like in an editor
            if (!source || !source.value) {
                return;
            }

            const importPathWithQueryString = source.value;

            // If not undefined, the user decided if rules are enforced on this import
            const overrideAction = computeOverrideAction(
                props.pathGroupOverrides || [],
                importPathWithQueryString,
            );

            if (overrideAction === 'ignore') {
                return;
            }

            // don't enforce anything on builtins
            if (!overrideAction && isBuiltIn(importPathWithQueryString, context.settings)) {
                return;
            }

            const importPath = importPathWithQueryString.replace(/\?(.*)$/, '');

            // don't enforce in root external packages as they may have names with `.js`.
            // Like `import Decimal from decimal.js`)
            if (!overrideAction && isExternalRootModule(importPath)) {
                return;
            }

            const resolvedPath = resolve(importPath, context);

            // get extension from resolved path, if possible.
            // for unresolved, use source value.
            const extension = path.extname(resolvedPath || importPath).substring(1);

            // determine if this is a module
            const isPackage = isExternalModule(importPath, resolve(importPath, context), context)
                || isScoped(importPath);

            if (!extension || !importPath.endsWith(`.${extension}`)) {
                // ignore type-only imports and exports
                if (
                    !props.checkTypeImports
                    && (node.importKind === 'type' || node.exportKind === 'type')
                ) {
                    return;
                }
                const extensionRequired = isUseOfExtensionRequired(
                    extension,
                    !overrideAction && isPackage,
                );
                const extensionForbidden = isUseOfExtensionForbidden(extension);
                if (extensionRequired && !extensionForbidden) {
                    context.report({
                        node: source,
                        message: `Missing file extension ${extension ? `"${extension}" ` : ''}for "${importPathWithQueryString}"`,
                    });
                }
            } else if (extension) {
                if (isUseOfExtensionForbidden(extension) && isResolvableWithoutExtension(importPath)) {
                    context.report({
                        node: source,
                        message: `Unexpected use of file extension "${extension}" for "${importPathWithQueryString}"`,
                    });
                }
            }
        }

        return moduleVisitor(checkFileExtension, { commonjs: true });
    },
};
export default rule;
