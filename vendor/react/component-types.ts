/**
 * @file State shared by React component detection and rule visitors.
 */
import type { LegacyListener, Node, RuleContext } from './types';
import type Components from './lib/util/Components';

export interface UsedPropType {
    name: string;
    allNames?: string[];
    node?: Node;
}
export interface DefaultProp {
    name: string;
    node: Node;
}
interface PropDetails {
    name?: string;
    fullName?: string;
    node?: Node;
    isRequired?: boolean;
    containsIndexers?: boolean;
    containsSpread?: boolean;
    containsUnresolvedSpread?: boolean;
}
export type PropType = PropDetails &
    (
        | { type?: undefined; children?: undefined }
        | { type: 'shape' | 'exact' | 'object'; children: Record<string, PropType> }
        | { type: 'union'; children: PropType[] }
    );
export type UnionTypeDefinition = Extract<PropType, { type: 'union' }>;
export interface Component {
    node: Node;
    confidence: number;
    usedPropTypes?: UsedPropType[];
    declaredPropTypes?: Record<string, PropType>;
    defaultProps?: Record<string, DefaultProp> | 'unresolved';
    ignorePropsValidation?: boolean;
    ignoreUnusedPropTypesValidation?: boolean;
    hasReturnStatement?: boolean;
    hasSCU?: boolean;
    useSetState?: boolean;
    setStateUsages?: Node[];
    hasChildContextTypes?: boolean;
    useThis?: boolean;
    usePropsOrContext?: boolean;
    useRef?: boolean;
    invalidReturn?: boolean;
    useDecorators?: boolean;
    inConstructor?: boolean;
    inCallExpression?: boolean;
    mutateSetState?: boolean;
    mutations?: Node[];
    hasDisplayName?: boolean;
    invalidProps?: Node[];
}
export interface ComponentUtils {
    isDestructuredFromPragmaImport(node: Node, variable: string): boolean;
    isReturningJSX(node: Node, strict?: boolean): boolean;
    isReturningJSXOrNull(node: Node, strict?: boolean): boolean;
    isReturningOnlyNull(node: Node): boolean;
    getPragmaComponentWrapper(node: Node): Node | undefined;
    getComponentNameFromJSXElement(node: Node): string | Node<'JSXIdentifier'> | null;
    getNameOfWrappedComponent(nodes: Node[]): string | Node<'JSXIdentifier'> | null | undefined;
    getDetectedComponents(): (string | null | undefined)[];
    nodeWrapsComponent(node: Node<'CallExpression'>): boolean;
    isPragmaComponentWrapper(node: Node): boolean;
    findReturnStatement(node: Node): Node<'ReturnStatement'> | false;
    getParentComponent(node: Node): Node | null;
    isInAllowedPositionForComponent(node: Node): boolean;
    getStatelessComponent(node: Node): Node | undefined;
    getParentStatelessComponent(node: Node): Node | null;
    getRelatedComponent(node: Node): Component | null;
    isParentComponentNotStatelessComponent(node: Node): boolean;
    isReactHookCall(node: Node, expectedHookNames?: string[]): boolean;
}
export type ComponentRule<Options extends readonly unknown[] = readonly unknown[]> = (
    context: RuleContext<Options>,
    components: InstanceType<typeof Components>,
    utils: ComponentUtils,
) => LegacyListener;
export type TypeDeclarationBuilders = {
    [Kind in
        | 'GenericTypeAnnotation'
        | 'ObjectTypeAnnotation'
        | 'UnionTypeAnnotation'
        | 'ArrayTypeAnnotation']: (
        annotation: Node<Kind>,
        parentName: string,
        seen: Set<Node>,
    ) => PropType;
};
