import type { Node, VisitorKeys } from '../types';

/**
 * Visit.
 * @param node The node to inspect.
 * @param keys The keys value.
 * @param visitorSpec The visitor spec value.
 */
export default function visit(
    node: Node | null | undefined,
    keys: VisitorKeys | null | undefined,
    visitorSpec: Record<string, { visit(node: Node): void }['visit']>,
) {
    if (!node || !keys) {
        return;
    }
    const { type } = node;
    const visitor = visitorSpec[type];
    if (typeof visitor === 'function') {
        visitor(node);
    }
    const childFields = keys[type];
    if (!childFields) {
        return;
    }
    childFields.forEach((fieldName) => {
        ([] as unknown[])
            .concat((node as unknown as Record<string, unknown>)[fieldName])
            .forEach((item) => {
                visit(item as Node | null | undefined, keys, visitorSpec);
            });
    });

    const exit = visitorSpec[`${type}:Exit`];
    if (typeof exit === 'function') {
        exit(node);
    }
}
