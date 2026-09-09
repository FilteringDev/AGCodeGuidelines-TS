/** @file Types for JavaScript-only upstream plugin exports. */
declare module 'eslint-plugin-jsx-a11y' {
    const plugin: import('@oxlint/plugins').Plugin;
    export default plugin;
}
declare module 'eslint-plugin-import' {
    const plugin: import('@oxlint/plugins').Plugin;
    export default plugin;
}
declare module '*vendor/core/lib/rules/index.js' {
    const rules: Map<string, import('@oxlint/plugins').Rule>;
    export default rules;
}
declare module '*vendor/jsdoc/index.js' {
    const plugin: import('@oxlint/plugins').Plugin & {
        configs: Record<string, { rules: Record<string, unknown> }>;
    };
    export default plugin;
}
declare module '*vendor/import/index.js' {
    const plugin: import('@oxlint/plugins').Plugin;
    export default plugin;
}
declare module '*vendor/react/index.js' {
    const plugin: import('@oxlint/plugins').Plugin;
    export default plugin;
}
declare module '*vendor/core/compat/get-jsdoc-comment.js' {
    const getJSDocComment: (
        this: Parameters<import('@oxlint/plugins').CreateRule['create']>[0]['sourceCode'],
        node: import('@oxlint/plugins').ESTree.Node,
    ) => import('@oxlint/plugins').ESTree.Comment | null;
    export default getJSDocComment;
}
