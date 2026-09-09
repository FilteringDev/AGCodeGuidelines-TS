/** @file Types for JavaScript-only upstream plugin exports. */
declare module 'eslint-plugin-jsx-a11y' {
    const plugin: import('@oxlint/plugins').Plugin;
    export default plugin;
}
declare module 'eslint-plugin-import' {
    const plugin: import('@oxlint/plugins').Plugin;
    export default plugin;
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
