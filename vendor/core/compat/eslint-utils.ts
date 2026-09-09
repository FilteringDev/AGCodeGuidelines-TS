/** @file External utility contracts for the parser and scope objects supplied by Oxlint. */
import * as utilities from '@eslint-community/eslint-utils';
import type { LegacyAPI, Node, Scope } from '../../types';

type Action = typeof utilities.READ | typeof utilities.CALL | typeof utilities.CONSTRUCT;
type Tracked<Info, Kind extends Action> = {
    info: Info;
    node: Kind extends typeof utilities.CALL
        ? Node<'CallExpression'>
        : Kind extends typeof utilities.CONSTRUCT
            ? Node<'NewExpression'>
            : Node;
    path: string[];
    type: Kind;
};
// Literal trace maps determine both the tracked node kind and its attached information.
// A depth bound also permits callers with the library's recursive TraceMap interface.
type TraceResults<Trace, Depth extends unknown[] = []> = Depth['length'] extends 8
    ? Tracked<unknown, Action>
    : Trace extends object
        ? {
            [Key in keyof Trace]: Key extends Action
                ? Tracked<Trace[Key], Key>
                : Key extends string
                    ? TraceResults<Trace[Key], [...Depth, unknown]>
                    : never;
        }[keyof Trace]
        : never;
interface Tracker {
    iterateGlobalReferences<Trace extends utilities.TraceMap<unknown>>(
        traceMap: Trace,
    ): Iterable<TraceResults<Trace>>;
    iterateCjsReferences<Trace extends utilities.TraceMap<unknown>>(
        traceMap: Trace,
    ): Iterable<TraceResults<Trace>>;
    iterateEsmReferences<Trace extends utilities.TraceMap<unknown>>(
        traceMap: Trace,
    ): Iterable<TraceResults<Trace>>;
    iteratePropertyReferences<Trace extends utilities.TraceMap<unknown>>(
        node: Node,
        traceMap: Trace,
    ): Iterable<TraceResults<Trace>>;
}
interface TrackerConstructor {
    new (scope: Scope, options?: utilities.ReferenceTrackerOptions): Tracker;
    READ: typeof utilities.READ;
    CALL: typeof utilities.CALL;
    CONSTRUCT: typeof utilities.CONSTRUCT;
    ESM: typeof utilities.ESM;
}
type Utilities = LegacyAPI<
    Omit<
        typeof utilities,
        'ReferenceTracker' | 'default' | 'CALL' | 'CONSTRUCT' | 'READ' | 'ESM'
    >
> & {
    ReferenceTracker: TrackerConstructor;
    readonly CALL: typeof utilities.CALL;
    readonly CONSTRUCT: typeof utilities.CONSTRUCT;
    readonly READ: typeof utilities.READ;
    readonly ESM: typeof utilities.ESM;
};

// The external helpers consume the same ESTree and scope API implemented by the adapter.
// Keep their contracts, including generic trace information, while substituting parser-owned nodes.
const legacyUtilities = utilities as unknown as Utilities;
export default legacyUtilities;
