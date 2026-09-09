import path from 'node:path';
import type { LegacyRule, Fixer, ModuleSource } from '../../types';
import { getPhysicalFilename } from '../../utils/contextCompat';
import moduleVisitor, { makeOptionsSchema } from '../../utils/moduleVisitor';
import { isAbsolute } from '../core/importType';
import docsUrl from '../docsUrl';

const rule: LegacyRule<[{ commonjs?: boolean; amd?: boolean; esmodule?: boolean; ignore?: string[] }?]> = {
    meta: {
        type: 'suggestion',
        docs: {
            category: 'Static analysis',
            description: 'Forbid import of modules using absolute paths.',
            url: docsUrl('no-absolute-path'),
        },
        fixable: 'code',
        schema: [makeOptionsSchema()],
    },

    create(context) {
        /**
         * Report if absolute.
         * @param source The source text.
         */
        function reportIfAbsolute(source: ModuleSource) {
            if (isAbsolute(source.value)) {
                context.report({
                    node: source,
                    message: 'Do not import modules using an absolute path',
                    fix(fixer: Fixer) {
                        // node.js and web imports work with posix style paths ("/")
                        let relativePath = path.posix.relative(
                            path.dirname(getPhysicalFilename(context)),
                            source.value,
                        );
                        if (!relativePath.startsWith('.')) {
                            relativePath = `./${relativePath}`;
                        }
                        return fixer.replaceText(source, JSON.stringify(relativePath));
                    },
                });
            }
        }

        const options = { esmodule: true, commonjs: true, ...context.options[0] };
        return moduleVisitor(reportIfAbsolute, options);
    },
};
export default rule;
