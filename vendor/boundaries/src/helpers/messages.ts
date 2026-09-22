/** @file Boundary violation messages. */
import { micromatchPatternReplacingObjectsValues } from './rules';
import { isArray, isString, replaceObjectValuesInTemplates } from './utils';
import type { ElementInfo } from './rules';

type ElementMatcher = string | [string, Record<string, string | string[]>];
type ElementPattern = ElementMatcher | ElementMatcher[];

/**
 * Quote a message fragment.
 * @param value The fragment value.
 * @returns The quoted fragment.
 */
export function quote(value: string): string {
    return `'${value}'`;
}

/**
 * Describe an element type matcher.
 * @param elementMatcher The matcher value.
 * @returns The description.
 */
function typeMessage(elementMatcher: string): string {
    return `elements of type ${quote(elementMatcher)}`;
}

/**
 * Join property fragments.
 * @param properties The property names.
 * @param index The current index.
 * @returns The connector text.
 */
function propertiesConcater(properties: string[], index: number): string {
    if (properties.length > 1 && index === properties.length - 1) {
        return ' and';
    }
    if (index === 0) {
        return ' with';
    }
    return ',';
}

/**
 * Describe match patterns with captured values.
 * @param patterns The match patterns.
 * @param elementCapturedValues The captured values.
 * @returns The description.
 */
function micromatchPatternMessage(
    patterns: string | string[],
    elementCapturedValues: Record<string, Record<string, string>>,
): string {
    const withValues = micromatchPatternReplacingObjectsValues(
        patterns,
        { from: elementCapturedValues as unknown as Record<string, string> },
    );
    if (isArray(withValues)) {
        const list = withValues as string[];
        if (list.length === 1) {
            return quote(list[0]!);
        }
        return list.reduce((message: string, pattern: string, index: number) => {
            if (index === 0) {
                return quote(pattern);
            }
            if (index === list.length - 1) {
                return `${message} or ${quote(pattern)}`;
            }
            return `${message}, ${quote(pattern)}`;
        }, '');
    }
    return quote(withValues as string);
}

/**
 * Describe captured value matchers.
 * @param pattern The captured values pattern.
 * @param elementCapturedValues The captured values.
 * @returns The description.
 */
function capturedValuesMatcherMessage(
    pattern: Record<string, string | string[]>,
    elementCapturedValues: Record<string, Record<string, string>>,
): string {
    const keys = Object.keys(pattern);
    return keys
        .map((key) => [key, pattern[key]] as const)
        .reduce((message, [name, matcher], index) => `${message}${propertiesConcater(keys, index)}${name} ${micromatchPatternMessage(
            matcher as string,
            elementCapturedValues,
        )}`, '');
}

/**
 * Describe an element matcher.
 * @param matcher The matcher value.
 * @param elementCapturedValues The captured values.
 * @returns The description.
 */
function elementMatcherMessage(
    matcher: ElementMatcher,
    elementCapturedValues: Record<string, Record<string, string>>,
): string {
    if (isString(matcher)) {
        return typeMessage(matcher);
    }
    return `${typeMessage((matcher as unknown as [string])[0])}${capturedValuesMatcherMessage(
        (matcher as unknown as [string, Record<string, string | string[]>])[1],
        elementCapturedValues,
    )}`;
}

/**
 * Describe rule element patterns.
 * @param patterns The element patterns.
 * @param elementCapturedValues The captured values.
 * @returns The description.
 */
export function ruleElementMessage(
    patterns: ElementPattern,
    elementCapturedValues: Record<string, Record<string, string>>,
): string {
    if (isArray(patterns)) {
        const list = patterns as ElementMatcher[];
        if (list.length === 1) {
            return elementMatcherMessage(list[0]!, elementCapturedValues);
        }
        return list.reduce((message: string, pattern: ElementMatcher, index: number) => {
            if (index === 0) {
                return elementMatcherMessage(pattern, elementCapturedValues);
            }
            return `${message}, or ${elementMatcherMessage(pattern, elementCapturedValues)}`;
        }, '');
    }
    return elementMatcherMessage(
        patterns as string | [string, Record<string, string | string[]>],
        elementCapturedValues,
    );
}

interface TemplateElement extends ElementInfo {
    source?: string;
    parents: { type: string | null }[];
}

/**
 * Collect template replacement properties.
 * @param element The element info.
 * @returns The replacement properties.
 */
function elementPropertiesToReplaceInTemplate(element: TemplateElement): Record<string, string> {
    return {
        ...element.capturedValues,
        type: element.type ?? '',
        internalPath: element.internalPath ?? '',
        source: element.source ?? '',
        importKind: element.importKind ?? '',
    };
}

/**
 * Render a custom error message with templates.
 * @param message The message template.
 * @param file The file element.
 * @param dependency The dependency element.
 * @param report The report values.
 * @returns The rendered message.
 */
export function customErrorMessage(
    message: string,
    file: TemplateElement,
    dependency: TemplateElement,
    report: Record<string, string> = {},
): string {
    let replacedMessage = replaceObjectValuesInTemplates(
        replaceObjectValuesInTemplates(message, elementPropertiesToReplaceInTemplate(file), 'file'),
        elementPropertiesToReplaceInTemplate(dependency),
        'dependency',
    ) as string;
    replacedMessage = replaceObjectValuesInTemplates(
        replaceObjectValuesInTemplates(
            replacedMessage,
            elementPropertiesToReplaceInTemplate(file),
            'from',
        ),
        elementPropertiesToReplaceInTemplate(dependency),
        'target',
    ) as string;
    if (file.parents[0]) {
        replacedMessage = replaceObjectValuesInTemplates(
            replacedMessage,
            elementPropertiesToReplaceInTemplate(file.parents[0] as TemplateElement),
            'file.parent',
        ) as string;
        replacedMessage = replaceObjectValuesInTemplates(
            replacedMessage,
            elementPropertiesToReplaceInTemplate(file.parents[0] as TemplateElement),
            'from.parent',
        ) as string;
    }
    if (dependency.parents[0]) {
        replacedMessage = replaceObjectValuesInTemplates(
            replacedMessage,
            elementPropertiesToReplaceInTemplate(dependency.parents[0] as TemplateElement),
            'dependency.parent',
        ) as string;
        replacedMessage = replaceObjectValuesInTemplates(
            replacedMessage,
            elementPropertiesToReplaceInTemplate(dependency.parents[0] as TemplateElement),
            'target.parent',
        ) as string;
    }
    return replaceObjectValuesInTemplates(replacedMessage, report, 'report') as string;
}

/**
 * Describe captured values.
 * @param capturedValues The captured values.
 * @returns The description.
 */
function elementCapturedValuesMessage(capturedValues: Record<string, string> | null): string {
    if (!capturedValues) {
        return '';
    }
    const keys = Object.keys(capturedValues);
    return keys
        .map((key) => [key, capturedValues[key]] as const)
        .reduce((message, [name, value], index) => `${message}${propertiesConcater(keys, index)} ${name} ${quote(value ?? '')}`, '');
}

/**
 * Describe an element.
 * @param elementInfo The element info.
 * @returns The description.
 */
export function elementMessage(elementInfo: ElementInfo): string {
    return `of type ${quote(elementInfo.type ?? '')}${elementCapturedValuesMessage(elementInfo.capturedValues)}`;
}

/**
 * Check whether a kind message is needed.
 * @param ruleImportKind The rule import kind.
 * @param dependencyInfo The dependency info.
 * @returns Whether to print the kind.
 */
function hasToPrintKindMessage(ruleImportKind: string | undefined, dependencyInfo: ElementInfo): boolean {
    return Boolean(ruleImportKind && dependencyInfo.importKind);
}

/**
 * Describe the dependency import kind.
 * @param ruleImportKind The rule import kind.
 * @param dependencyInfo The dependency info.
 * @returns The description.
 */
export function dependencyImportKindMessage(ruleImportKind: string | undefined, dependencyInfo: ElementInfo): string {
    if (hasToPrintKindMessage(ruleImportKind, dependencyInfo)) {
        return `kind ${quote(dependencyInfo.importKind ?? '')} from `;
    }
    return '';
}
