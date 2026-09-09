import pkg from '../package.json';

const repoUrl = 'https://github.com/import-js/eslint-plugin-import';

/**
 * Docs url.
 * @param ruleName The rule name value.
 * @param commitish The commitish value.
 * @returns The result of this check.
 */
export default function docsUrl(ruleName: string, commitish = `v${pkg.version}`) {
    return `${repoUrl}/blob/${commitish}/docs/rules/${ruleName}.md`;
}
