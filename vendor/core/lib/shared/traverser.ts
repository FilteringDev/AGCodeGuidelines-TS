/**
 * @file Traverser to traverse AST trees.
 * @author Nicholas C. Zakas
 * @author Toru Nagashima
 */
import * as dependency0 from 'eslint-visitor-keys';
import dependency1 from 'debug';
import type { Node } from '../../../types';

//------------------------------------------------------------------------------
// Requirements
//------------------------------------------------------------------------------

const vk = dependency0;
const debug = dependency1('eslint:traverser');

//------------------------------------------------------------------------------
// Helpers
//------------------------------------------------------------------------------

/**
 * Do nothing.
 */
function noop() {
    // do nothing.
}

/**
 * Check whether the given value is an ASTNode or not.
 * @param x The value to check.
 * @returns `true` if the value is an ASTNode.
 */
function isNode(x: unknown): x is Node {
    // Parser-owned values carry the remaining ESTree fields once the node tag is present.
    return x !== null && typeof x === 'object' && 'type' in x && typeof x.type === 'string';
}

/**
 * Get the visitor keys of a given node.
 * @param visitorKeys The map of visitor keys.
 * @param node The node to get their visitor keys.
 * @returns The visitor keys of the node.
 */
function getVisitorKeys(visitorKeys: Readonly<Record<string, readonly string[]>>, node: Node) {
    let keys = visitorKeys[node.type];

    if (!keys) {
        keys = vk.getKeys(node);
        debug('Unknown node type "%s": Estimated visitor keys %j', node.type, keys);
    }

    return keys;
}

/**
 * The traverser class to traverse AST trees.
 */
type Visit = (this: Traverser, node: Node, parent?: Node | null) => void;
interface TraverseOptions {
    visitorKeys?: Readonly<Record<string, readonly string[]>>;
    enter?: Visit;
    leave?: Visit;
}

class Traverser {
    declare private currentNode: Node | null;

    declare private parentNodes: Node[];

    declare private skipped: boolean;

    declare private broken: boolean;

    declare private visitorKeys: Readonly<Record<string, readonly string[]>>;

    declare private enterNode: Visit;

    declare private leaveNode: Visit;

    constructor() {
        this.currentNode = null;
        this.parentNodes = [];
        this.skipped = false;
        this.broken = false;
        this.visitorKeys = vk.KEYS;
        this.enterNode = noop;
        this.leaveNode = noop;
    }

    /**
     * Gives current node.
     * @returns The current node.
     */
    current() {
        return this.currentNode;
    }

    /**
     * Gives a copy of the ancestor nodes.
     * @returns The ancestor nodes.
     */
    parents() {
        return this.parentNodes.slice(0);
    }

    /**
     * Break the current traversal.
     */
    break() {
        this.broken = true;
    }

    /**
     * Skip child nodes for the current traversal.
     */
    skip() {
        this.skipped = true;
    }

    /**
     * Traverse the given AST tree.
     * @param node The root node to traverse.
     * @param options The option object.
     * @param [options.visitorKeys] The keys of each node types to traverse child nodes. Default is
     * `./default-visitor-keys.json`.
     * @param [options.enter] The callback function which is called on entering each node.
     * @param [options.leave] The callback function which is called on leaving each node.
     */
    traverse(node: Node, options: TraverseOptions) {
        this.currentNode = null;
        this.parentNodes = [];
        this.skipped = false;
        this.broken = false;
        this.visitorKeys = options.visitorKeys || vk.KEYS;
        this.enterNode = options.enter || noop;
        this.leaveNode = options.leave || noop;
        this.traverseChildren(node, null);
    }

    /**
     * Traverse the given AST tree recursively.
     * @param node The current node.
     * @param parent The parent node.
     */
    private traverseChildren(node: unknown, parent: Node | null) {
        if (!isNode(node)) {
            return;
        }

        this.currentNode = node;
        this.skipped = false;
        this.enterNode(node, parent);

        if (!this.skipped && !this.broken) {
            const keys = getVisitorKeys(this.visitorKeys, node);

            if (keys.length >= 1) {
                this.parentNodes.push(node);
                for (let i = 0; i < keys.length && !this.broken; i += 1) {
                    const child: unknown = Reflect.get(node, keys[i]!);

                    if (Array.isArray(child)) {
                        for (let j = 0; j < child.length && !this.broken; j += 1) {
                            this.traverseChildren(child[j], node);
                        }
                    } else {
                        this.traverseChildren(child, node);
                    }
                }
                this.parentNodes.pop();
            }
        }

        if (!this.broken) {
            this.leaveNode(node, parent);
        }

        this.currentNode = parent;
    }

    /**
     * Calculates the keys to use for traversal.
     * @param node The node to read keys from.
     * @returns An array of keys to visit on the node.
     */
    static getKeys(node: Node) {
        return vk.getKeys(node);
    }

    /**
     * Traverse the given AST tree.
     * @param node The root node to traverse.
     * @param options The option object.
     * @param [options.visitorKeys] The keys of each node types to traverse child nodes. Default is
     * `./default-visitor-keys.json`.
     * @param [options.enter] The callback function which is called on entering each node.
     * @param [options.leave] The callback function which is called on leaving each node.
     */
    static traverse(node: Node, options: TraverseOptions) {
        new Traverser().traverse(node, options);
    }

    /**
     * The default visitor keys.
     * @returns The standard parser visitor keys.
     */
    static getDefaultVisitorKeys() {
        return vk.KEYS;
    }
}

export default Traverser;
