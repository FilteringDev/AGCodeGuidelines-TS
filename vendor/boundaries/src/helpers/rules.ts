/** @file Element matching and rule evaluation. */
import { isMatch } from '../glob';
import { isArray, replaceObjectValuesInTemplates } from './utils';

export const REPO_URL = 'https://github.com/javierbrea/eslint-plugin-boundaries';

export interface ElementInfo {
    type: string | null;
    elementPath: string | null;
    capture: string[] | null;
    capturedValues: Record<string, string> | null;
    internalPath: string | null;
    importKind?: string;
}

export interface RuleReport {
    message?: string;
    isDefault?: boolean;
    element?: unknown;
    disallow?: unknown;
    index?: number;
    importKind?: string;
}

/**
 * Build the documentation URL for a rule.
 * @param ruleName The rule name.
 * @returns The documentation URL.
 */
export function docsUrl(ruleName: string): string {
    return `${REPO_URL}/blob/master/docs/rules/${ruleName.replace('boundaries/', '')}.md`;
}

/**
 * Build rule metadata.
 * @param options The rule metadata options.
 * @param options.description
 * @param options.schema
 * @param options.ruleName
 * @returns The metadata object.
 */
export function meta({ description, schema = [], ruleName }: {
    description: string;
    schema?: unknown[];
    ruleName: string;
}) {
    return {
        meta: {
            type: 'problem',
            docs: {
                url: docsUrl(ruleName),
                description,
                category: 'dependencies',
            },
            fixable: null,
            schema,
        },
    };
}

/**
 * Replace captured values in a match pattern.
 * @param pattern The match pattern.
 * @param object The captured values namespaces.
 * @returns The replaced pattern.
 */
export function micromatchPatternReplacingObjectsValues(
    pattern: string | string[],
    object: Record<string, Record<string, string> | string>,
): string | string[] {
    let patternToReplace = pattern;
    // Backward compatibility
    const from = (object as Record<string, unknown>).from as Record<string, string> | undefined;
    if (from) {
        patternToReplace = replaceObjectValuesInTemplates(
            patternToReplace as string,
            from as unknown as Record<string, string>,
        ) as string | string[];
    }
    return Object.keys(object).reduce<string | string[]>((replacedPattern, namespace) => {
        const values = (object as Record<string, Record<string, string> | undefined>)[namespace];
        if (!values) {
            return replacedPattern;
        }
        return replaceObjectValuesInTemplates(
            replacedPattern as string,
            values as Record<string, string>,
            namespace,
        ) as string | string[];
    }, patternToReplace);
}

/**
 * Test captured values against options matchers.
 * @param objectWithMatchers The matcher object.
 * @param object The element captured values.
 * @param objectsWithValuesToReplace The replacement namespaces.
 * @returns Whether the values match.
 */
export function isObjectMatch(
    objectWithMatchers: Record<string, string | string[]>,
    object: Record<string, string> | null,
    objectsWithValuesToReplace: Record<string, Record<string, string>>,
): boolean {
    return Object.keys(objectWithMatchers).reduce((matched, key) => {
        if (matched) {
            if (!object || !object[key]) {
                return false;
            }
            const pattern = micromatchPatternReplacingObjectsValues(
                objectWithMatchers[key]!,
                objectsWithValuesToReplace,
            );
            return isMatch(object[key]!, pattern);
        }
        return matched;
    }, true);
}

type IsMatch = (
    targetElement: ElementInfo,
    matcher: string | [string, Record<string, unknown>],
    captures: Record<string, unknown>,
    namespaces: { from: Record<string, string> | null; target: Record<string, string> | null },
    importKind?: string,
) => { result: boolean; report?: unknown };

/**
 * Normalize the main rule key.
 * @param key The configured key.
 * @returns The main key.
 */
export function rulesMainKey(key: string | undefined): string {
    return key || 'from';
}

/**
 * Test rule matchers against a target element.
 * @param ruleMatchers The configured matchers.
 * @param targetElement The target element info.
 * @param isMatchElement The element matcher.
 * @param fromElement The from element info.
 * @param importKind The dependency import kind.
 * @returns The match result.
 */
export function ruleMatch(
    ruleMatchers: unknown,
    targetElement: ElementInfo,
    isMatchElement: IsMatch,
    fromElement: ElementInfo,
    importKind?: string,
): { result: boolean; report?: unknown } {
    let match: { result: boolean; report?: unknown } = { result: false, report: null };
    const matchers = !isArray(ruleMatchers) ? [ruleMatchers] : (ruleMatchers as unknown[]);
    for (let matcherIndex = 0; matcherIndex < matchers.length; matcherIndex += 1) {
        const matcher = matchers[matcherIndex];
        if (!match.result) {
            if (isArray(matcher)) {
                const [value, captures] = matcher as [string, Record<string, unknown>];
                match = isMatchElement(
                    targetElement,
                    value,
                    captures,
                    {
                        from: fromElement.capturedValues,
                        target: targetElement.capturedValues,
                    },
                    importKind,
                );
            } else {
                match = isMatchElement(
                    targetElement,
                    matcher as string,
                    {},
                    {
                        from: fromElement.capturedValues,
                        target: targetElement.capturedValues,
                    },
                    importKind,
                );
            }
        }
    }
    return match;
}

/**
 * Test an element info object against a matcher for one key.
 * @param elementInfo The element info.
 * @param matcher The match pattern.
 * @param options The matcher options.
 * @param elementKey The element key to test.
 * @param elementsToCompareCapturedValues The replacement namespaces.
 * @returns The match result.
 */
export function isMatchElementKey(
    elementInfo: ElementInfo,
    matcher: string,
    options: Record<string, string | string[]> | undefined,
    elementKey: 'type' | 'internalPath',
    elementsToCompareCapturedValues: Record<string, Record<string, string>>,
): { result: boolean } {
    const matched = isMatch(
        elementInfo[elementKey] ?? '',
        micromatchPatternReplacingObjectsValues(matcher, elementsToCompareCapturedValues) as string,
    );
    if (matched && options) {
        return {
            result: isObjectMatch(options, elementInfo.capturedValues, elementsToCompareCapturedValues),
        };
    }
    return {
        result: matched,
    };
}

/**
 * Test the import kind against the element info.
 * @param elementInfo The element info.
 * @param importKind The dependency import kind.
 * @returns Whether the kind matches.
 */
export function isMatchImportKind(elementInfo: ElementInfo, importKind?: string): boolean {
    if (!elementInfo.importKind || !importKind) {
        return true;
    }
    return isMatch(elementInfo.importKind, importKind);
}

/**
 * Test an element type matcher.
 * @param elementInfo The element info.
 * @param matcher The match pattern.
 * @param options The matcher options.
 * @param elementsToCompareCapturedValues The replacement namespaces.
 * @param importKind The dependency import kind.
 * @returns The match result.
 */
export function isMatchElementType(
    elementInfo: ElementInfo,
    matcher: string | [string, Record<string, unknown>],
    options: Record<string, string | string[]> | undefined,
    elementsToCompareCapturedValues: Record<string, Record<string, string>>,
    importKind?: string,
): { result: boolean } {
    if (!isMatchImportKind(elementInfo, importKind)) {
        return { result: false };
    }
    const [pattern, matcherOptions] = Array.isArray(matcher) ? matcher : [matcher, options];
    return isMatchElementKey(
        elementInfo,
        pattern as string,
        matcherOptions as Record<string, string | string[]> | undefined,
        'type',
        elementsToCompareCapturedValues,
    );
}

/**
 * Collect the rules applying to a target element.
 * @param targetElement The target element info.
 * @param options The rule options.
 * @param options.rules
 * @param mainKey The main rule key.
 * @param fromElement The from element info.
 * @returns The matching rules with indexes.
 */
export function getElementRules(
    targetElement: ElementInfo,
    options: { rules?: Record<string, unknown>[] },
    mainKey: string | undefined,
    fromElement: ElementInfo,
): (Record<string, unknown> & { index: number })[] {
    if (!options.rules) {
        return [];
    }
    const key = rulesMainKey(mainKey);
    return (options.rules as Record<string, unknown>[])
        .map((rule, index) => ({
            ...rule,
            index,
        }))
        .filter((rule) => ruleMatch(
            (rule as Record<string, unknown>)[key],
            targetElement,
            isMatchElementType as IsMatch,
            fromElement,
        ).result);
}

/**
 * Check whether the main key is the from key.
 * @param mainKey The main rule key.
 * @returns Whether rules are selected from the from element.
 */
export function isFromRule(mainKey: string | undefined): boolean {
    return rulesMainKey(mainKey) === 'from';
}

/**
 * Select the element providing the rule list.
 * @param element The file element.
 * @param dependency The dependency element.
 * @param mainKey The main rule key.
 * @returns The element to read rules from.
 */
export function elementToGetRulesFrom(
    element: ElementInfo,
    dependency: ElementInfo,
    mainKey: string | undefined,
): ElementInfo {
    if (!isFromRule(mainKey)) {
        return dependency;
    }
    return element;
}

export interface AllowResult {
    result: boolean;
    report?: unknown;
    ruleReport?: RuleReport;
}

/**
 * Evaluate whether a dependency is allowed.
 * @param options.element
 * @param options.dependency
 * @param options The evaluation options.
 * @param options.options
 * @param options.options.rules
 * @param options.options.default
 * @param options.options.message
 * @param options.isMatch
 * @param options.rulesMainKey
 * @returns The evaluation result.
 */
export function elementRulesAllowDependency({
    element,
    dependency,
    options,
    isMatch: isMatchElement,
    rulesMainKey: mainKey,
}: {
    element: ElementInfo;
    dependency: ElementInfo;
    options: { rules?: Record<string, unknown>[]; default?: string; message?: string };
    isMatch: IsMatch;
    rulesMainKey?: string;
}): AllowResult {
    const targetElement = elementToGetRulesFrom(element, dependency, mainKey);
    const [result, report, ruleReport] = getElementRules(
        targetElement,
        options,
        mainKey,
        targetElement === element ? dependency : element,
    ).reduce<[boolean, unknown, RuleReport]>(
        (allowed: [boolean, unknown, RuleReport], rule) => {
            const ruleRecord = rule as Record<string, unknown> & {
                disallow?: unknown;
                allow?: unknown;
                index: number;
                message?: string;
                importKind?: string;
            };
            if (ruleRecord.disallow) {
                const match = ruleMatch(
                    ruleRecord.disallow,
                    dependency,
                    isMatchElement,
                    element,
                    ruleRecord.importKind,
                );
                if (match.result) {
                    return [
                        false,
                        match.report,
                        {
                            element: ruleRecord[rulesMainKey(mainKey)],
                            disallow: ruleRecord.disallow,
                            index: ruleRecord.index,
                            message: (ruleRecord.message || options.message) as string | undefined,
                            importKind: ruleRecord.importKind,
                        },
                    ];
                }
            }
            if (ruleRecord.allow) {
                const match = ruleMatch(ruleRecord.allow, dependency, isMatchElement, element, ruleRecord.importKind);
                if (match.result) {
                    return [true, match.report, allowed[2]];
                }
            }
            return allowed;
        },
        [
            options.default === 'allow',
            null,
            {
                isDefault: true,
                message: options.message,
            },
        ],
    );
    return {
        result,
        report,
        ruleReport,
    };
}
