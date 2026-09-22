/** @file Check allowed dependencies between element types. */
import { RULE_ELEMENT_TYPES } from '../constants/settings';
import { dependencyRule } from '../rules-factories/dependency-rule';
import {
    elementRulesAllowDependency,
    isMatchElementType,
    type AllowResult,
    type ElementInfo,
} from '../helpers/rules';
import type { DependencyInfo, FileInfo } from '../core/elementsInfo';
import {
    customErrorMessage,
    dependencyImportKindMessage,
    elementMessage,
    ruleElementMessage,
} from '../helpers/messages';

/**
 * Evaluate whether a dependency is allowed for the file element.
 * @param file The file element.
 * @param dependency The dependency element.
 * @param options The rule options.
 * @param options.rules
 * @param options.default
 * @param options.message
 * @returns The evaluation result.
 */
function elementRulesAllowDependencyType(
    file: FileInfo,
    dependency: DependencyInfo,
    options: { rules?: Record<string, unknown>[]; default?: string; message?: string },
) {
    return elementRulesAllowDependency({
        element: file as unknown as ElementInfo,
        dependency: dependency as unknown as ElementInfo,
        options,
        isMatch: isMatchElementType as never,
    });
}

/**
 * Render the violation message.
 * @param ruleData The rule evaluation data.
 * @param ruleData.ruleReport
 * @param ruleData.ruleReport.message
 * @param ruleData.ruleReport.isDefault
 * @param ruleData.ruleReport.importKind
 * @param ruleData.ruleReport.disallow
 * @param ruleData.ruleReport.element
 * @param ruleData.ruleReport.index
 * @param file The file element.
 * @param dependency The dependency element.
 * @returns The message text.
 */
function errorMessage(
    ruleData: AllowResult,
    file: FileInfo,
    dependency: DependencyInfo,
): string {
    const { ruleReport } = ruleData;
    if (!ruleReport) {
        return 'No rule allowing this dependency was found.';
    }
    if (ruleReport.message) {
        return customErrorMessage(
            ruleReport.message,
            file as never,
            dependency as never,
        );
    }
    if (ruleReport.isDefault) {
        return `No rule allowing this dependency was found. File is ${elementMessage(
            file as unknown as ElementInfo,
        )}. Dependency is ${elementMessage(dependency as unknown as ElementInfo)}`;
    }
    return `Importing ${dependencyImportKindMessage(
        ruleReport.importKind,
        dependency as unknown as ElementInfo,
    )}${ruleElementMessage(
        ruleReport.disallow as never,
        file.capturedValues as never,
    )} is not allowed in ${ruleElementMessage(
        ruleReport.element as never,
        file.capturedValues as never,
    )}. Disallowed in rule ${(ruleReport.index ?? 0) + 1}`;
}

export default dependencyRule(
    {
        ruleName: RULE_ELEMENT_TYPES,
        description: 'Check allowed dependencies between element types',
        schema: [
            {
                type: 'object',
                properties: {
                    default: { type: 'string', enum: ['allow', 'disallow'] },
                    rules: { type: 'array' },
                    message: { type: 'string' },
                },
            },
        ],
    },
    ({
        dependency,
        file,
        node,
        context,
        options,
    }) => {
        if (dependency.isLocal && !dependency.isIgnored && dependency.type && !dependency.isInternal) {
            const ruleData = elementRulesAllowDependencyType(file, dependency, options);
            if (!ruleData.result) {
                context.report({
                    message: errorMessage(ruleData, file, dependency),
                    node,
                });
            }
        }
    },
);
