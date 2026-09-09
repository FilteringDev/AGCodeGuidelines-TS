import { warn as writeWarning } from 'node:console';
/**
 * @file Utility functions for React pragma configuration
 * @author Yannick Croissant
 */
import dependency0 from './eslint';
import type { RuleContext } from '../../types';

const { getSourceCode } = dependency0;

const JSX_ANNOTATION_REGEX = /@jsx\s+([^\s]+)/;
// Does not check for reserved keywords or unicode characters
const JS_IDENTIFIER_REGEX = /^[_$a-zA-Z][_$a-zA-Z0-9]*$/;

/**
 * @param context The value to inspect.
 * @returns The result of this check.
 */
function getCreateClassFromContext(context: RuleContext) {
    let pragma = 'createReactClass';
    // .eslintrc shared settings (https://eslint.org/docs/user-guide/configuring#adding-shared-settings)
    if (context.settings.react && context.settings.react.createClass) {
        pragma = context.settings.react.createClass;
    }
    if (!JS_IDENTIFIER_REGEX.test(pragma)) {
        throw new Error(`createClass pragma ${pragma} is not a valid function name`);
    }
    return pragma;
}

/**
 * @param context The value to inspect.
 * @returns The result of this check.
 */
function getFragmentFromContext(context: RuleContext) {
    let pragma = 'Fragment';
    // .eslintrc shared settings (https://eslint.org/docs/user-guide/configuring#adding-shared-settings)
    if (context.settings.react && context.settings.react.fragment) {
        pragma = context.settings.react.fragment;
    }
    if (!JS_IDENTIFIER_REGEX.test(pragma)) {
        throw new Error(`Fragment pragma ${pragma} is not a valid identifier`);
    }
    return pragma;
}

/**
 * @param context The value to inspect.
 * @returns The result of this check.
 */
function getFromContext(context: RuleContext) {
    let pragma = 'React';

    const sourceCode = getSourceCode(context);
    const pragmaNode = sourceCode.getAllComments().find((node) => JSX_ANNOTATION_REGEX.test(node.value));

    if (pragmaNode) {
        const matches = JSX_ANNOTATION_REGEX.exec(pragmaNode.value);
        pragma = matches![1]!.split('.')[0]!;
        // .eslintrc shared settings (https://eslint.org/docs/user-guide/configuring#adding-shared-settings)
    } else if (context.settings.react && context.settings.react.pragma) {
        pragma = context.settings.react.pragma;
    }

    if (!JS_IDENTIFIER_REGEX.test(pragma)) {
        writeWarning(`React pragma ${pragma} is not a valid identifier`);
        return 'React';
    }
    return pragma;
}

export default {
    getCreateClassFromContext,
    getFragmentFromContext,
    getFromContext,
};
