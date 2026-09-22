/** @file Shared option resolution for the notice rule. */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { Fixer, Node } from '../../types';

export const COULD_NOT_FIND = 'Missing notice header';
export const REPORT_AND_SKIP = 'Found a header comment which did not have a notice header, skipping fix and reporting';
export const OUTSIDE_TOLERANCE = 'Found a header comment which was too different from the required notice header (similarity={{ similarity }})';

const DEFAULT_MESSAGE_CONFIG = {
    whenFailedToMatch: COULD_NOT_FIND,
    reportAndSkip: REPORT_AND_SKIP,
    whenOutsideTolerance: OUTSIDE_TOLERANCE,
};

const ESCAPE = /[-/\\^$*+?.()|[\]{}]/g;
const YEAR_REGEXP = /20\d{2}/;
export const NON_MATCHING_HEADER_ACTIONS = ['prepend', 'replace', 'report'];

export interface NoticeMessages {
    whenFailedToMatch: string;
    reportAndSkip: string;
    whenOutsideTolerance: string;
}

export interface NoticeOptions {
    mustMatch?: string | RegExp;
    templateFile?: string;
    template?: string;
    templateVars?: Record<string, string | number>;
    chars?: number;
    onNonMatchingHeader?: 'prepend' | 'replace' | 'report';
    varRegexps?: Record<string, string | RegExp>;
    nonMatchingTolerance?: number | null;
    messages?: Partial<NoticeMessages>;
}

/**
 * Escape a string for RegExp construction.
 * @param value The string value.
 * @returns The escaped string.
 */
function escapeRegExp(value: string): string {
    return String(value).replace(ESCAPE, '\\$&');
}

/**
 * Render a string template with <%= NAME %> placeholders.
 * @param template The template text.
 * @param values The placeholder values.
 * @returns The rendered text.
 */
function renderTemplate(template: string, values: Record<string, string | number>): string {
    return template.replace(/<%=\s*([\w.]+)\s*%>/g, (_all, key: string) => String(values[key] ?? ''));
}

/**
 * Convert a template plus variable patterns into a RegExp.
 * @param options The template options.
 * @param options.template
 * @param options.varRegexps
 * @returns The matcher RegExp.
 */
export function regexpizeTemplate({ template, varRegexps }: {
    template: string;
    varRegexps?: Record<string, string | RegExp>;
}): RegExp {
    const allRegexpVars: Record<string, string | RegExp> = {
        YEAR: YEAR_REGEXP,
        ...(varRegexps ?? {}),
    };
    const allPatternVars: Record<string, string> = {};
    for (let keyIndex = 0; keyIndex < Object.keys(allRegexpVars).length; keyIndex += 1) {
        const key = Object.keys(allRegexpVars)[keyIndex]!;
        const value = allRegexpVars[key]!;
        allPatternVars[key] = value instanceof RegExp ? value.source : String(value);
    }
    return new RegExp(renderTemplate(escapeRegExp(template), allPatternVars));
}

/**
 * Find the package root by walking up for package.json.
 * @param fileName The starting file name.
 * @returns The root directory.
 */
function findRoot(fileName: string): string {
    let directory = dirname(fileName);
    while (true) {
        if (existsSync(join(directory, 'package.json'))) {
            return directory;
        }
        const parent = dirname(directory);
        if (parent === directory) {
            return directory;
        }
        directory = parent;
    }
}

/**
 * Resolve the header template text.
 * @param options The template options.
 * @param options.templateFile
 * @param options.template
 * @param options.fileName
 * @returns The template text or null.
 */
function resolveTemplate({ templateFile, template, fileName }: {
    templateFile?: string;
    template?: string;
    fileName: string;
}): string | null {
    if (template) {
        return template;
    }
    // No template file, so move forward and disable --fix
    if (!templateFile) {
        return null;
    }
    // Naively look for the templateFile first
    if (existsSync(templateFile)) {
        return readFileSync(templateFile, 'utf8');
    }
    if (!existsSync(fileName)) {
        throw new Error(`Could not find the file name ${fileName}. This is necessary to find the root`);
    }
    const root = findRoot(fileName);
    const rootTemplateFile = join(root, templateFile);
    if (existsSync(rootTemplateFile)) {
        return readFileSync(rootTemplateFile, 'utf8');
    }
    const absRootTemplateFile = resolve(rootTemplateFile);
    if (existsSync(absRootTemplateFile)) {
        return readFileSync(absRootTemplateFile, 'utf8');
    }
    throw new Error(`Can't find templateFile @ ${absRootTemplateFile}`);
}

export interface ResolvedNoticeOptions {
    resolvedTemplate: string;
    mustMatch: RegExp;
    chars: number;
    onNonMatchingHeader: 'prepend' | 'replace' | 'report';
    nonMatchingTolerance: number | null;
    messages: NoticeMessages;
}

/**
 * Resolve rule options into matcher, template, and messages.
 * @param options The raw rule options.
 * @param fileName The current file name.
 * @returns The resolved options.
 */
export function resolveOptions(options: NoticeOptions | undefined, fileName: string): ResolvedNoticeOptions {
    const {
        mustMatch: rawMustMatch,
        templateFile,
        template: rawTemplate,
        templateVars = {},
        chars = 1000,
        onNonMatchingHeader = 'prepend',
        varRegexps = {},
        nonMatchingTolerance = null,
        messages: customMessages,
    } = options ?? {};
    let mustMatch = rawMustMatch as string | RegExp | undefined;
    let template = rawTemplate;
    const messages: NoticeMessages = { ...DEFAULT_MESSAGE_CONFIG, ...(customMessages ?? {}) };

    let mustMatchTemplate = false;
    if (!mustMatch) {
        mustMatchTemplate = true;
    } else if (!(mustMatch instanceof RegExp)) {
        mustMatch = new RegExp(mustMatch);
    }
    const resolved = resolveTemplate({ templateFile, template, fileName });
    template = resolved ?? undefined;
    if (typeof template === 'string') {
        template = template.replace(/\r\n/g, '\n');
    }
    const YEAR = new Date().getFullYear();
    const allVars: Record<string, string | number> = { YEAR, ...templateVars };
    if (mustMatchTemplate && template) {
        // create mustMatch from varRegexps and template
        mustMatch = regexpizeTemplate({ template, varRegexps });
    } else if (!template && mustMatchTemplate) {
        throw new Error('Either mustMatch, template, or templateFile must be set');
    }
    const resolvedTemplate = renderTemplate(template ?? '', allVars).replace(/\r\n/g, '\n');

    return {
        resolvedTemplate,
        mustMatch: mustMatch as RegExp,
        chars,
        onNonMatchingHeader,
        nonMatchingTolerance,
        messages,
    };
}

/**
 * Compute the longest-common-subsequence similarity ratio.
 * @param first The first string.
 * @param second The second string.
 * @returns The similarity ratio.
 */
export function similarityRatio(first: string, second: string): number {
    const firstLength = first.length;
    const secondLength = second.length;
    if (firstLength === 0 || secondLength === 0) {
        return 0;
    }
    const widths = new Array<number>(secondLength + 1).fill(0);
    for (let i = 1; i <= firstLength; i += 1) {
        let previous = 0;
        for (let j = 1; j <= secondLength; j += 1) {
            const current = widths[j]!;
            if (first[i - 1] === second[j - 1]) {
                widths[j] = previous + 1;
            } else {
                widths[j] = Math.max(widths[j]!, widths[j - 1]!);
            }
            previous = current;
        }
    }
    return (widths[secondLength]! * 2) / (firstLength + secondLength);
}

/**
 * Create the fixer for a missing or mismatched header.
 * @param options The fixer options.
 * @param options.resolvedTemplate
 * @param options.hasHeaderComment
 * @param options.topNode
 * @param options.onNonMatchingHeader
 * @returns The fixer or undefined.
 */
export function createFixer({
    resolvedTemplate,
    hasHeaderComment,
    topNode,
    onNonMatchingHeader,
}: {
    resolvedTemplate: string;
    hasHeaderComment: boolean;
    topNode: Node;
    onNonMatchingHeader: 'prepend' | 'replace' | 'report';
}): ((fixer: Fixer) => unknown) | undefined {
    if (!resolvedTemplate) {
        return undefined;
    }
    if (!hasHeaderComment || (hasHeaderComment && onNonMatchingHeader === 'prepend')) {
        return (fixer: Fixer) => fixer.insertTextBeforeRange([0, 0], resolvedTemplate);
    }
    if (hasHeaderComment && onNonMatchingHeader === 'replace') {
        return (fixer: Fixer) => fixer.replaceText(topNode, resolvedTemplate);
    }
    return undefined;
}

export { similarityRatio as metricLcs };
