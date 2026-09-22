/** @file Dependency visitor factory for boundary rules. */
import type { LegacyRule, Node, RuleContext } from '../../../import/types';
import {
    ADDITIONAL_DEPENDENCY_NODES,
    DEFAULT_DEPENDENCY_NODES,
    DEPENDENCY_NODES,
} from '../constants/settings';
import { getArrayOrNull } from '../helpers/utils';
import {
    dependencyInfo,
    fileInfo,
    type DependencyInfo,
    type FileInfo,
} from '../core/elementsInfo';
import { meta } from '../helpers/rules';

interface DependencyRuleOptions {
    validate?: boolean;
}

/**
 * Create a boundary dependency rule.
 * @param ruleMeta The rule metadata.
 * @param rule The rule visitor.
 * @param ruleOptions The factory options.
 * @returns The legacy rule.
 */
function createDependencyRule(
    ruleMeta: { ruleName: string; description: string; schema?: unknown[] },
    rule: (args: {
        dependency: DependencyInfo;
        file: FileInfo;
        node: Node;
        context: RuleContext;
        options: Record<string, unknown>;
    }) => void,
    ruleOptions: DependencyRuleOptions = {},
): LegacyRule {
    const factory = {
        ...meta(ruleMeta),
        create(context: RuleContext) {
            const options = (context.options[0] ?? {}) as Record<string, unknown>;
            const settings = (context.settings ?? {}) as Record<string, unknown>;
            const file = fileInfo(context);
            if ((ruleOptions.validate !== false && !context.options[0]) || file.isIgnored || !file.type) {
                return {};
            }

            const dependencyNodesSetting = getArrayOrNull(settings[DEPENDENCY_NODES] as string[] | null);
            const additionalDependencyNodesSetting = getArrayOrNull(
                settings[ADDITIONAL_DEPENDENCY_NODES] as { selector: string; kind: string }[] | null,
            );
            const dependencyNodes = (dependencyNodesSetting || ['import'])
                .map((dependencyNode) => DEFAULT_DEPENDENCY_NODES[dependencyNode as string])
                .flat()
                .filter((entry): entry is { selector: string; kind: string } => Boolean(entry));
            const additionalDependencyNodes = additionalDependencyNodesSetting || [];

            type VisitorMap = Record<string, (node: Node) => void>;
            return [...dependencyNodes, ...additionalDependencyNodes].reduce<VisitorMap>(
                (visitors, { selector, kind }) => {
                    const next = { ...visitors };
                    next[selector] = (node: Node) => {
                        const dependency = dependencyInfo(
                            (node as Node<'Literal'>).value as string,
                            kind,
                            context,
                        );

                        rule({
                            file,
                            dependency,
                            options,
                            node,
                            context,
                        });
                    };

                    return next;
                },
                {},
            );
        },
    };
    return factory as unknown as LegacyRule;
}

export default createDependencyRule;
export { createDependencyRule as dependencyRule };
