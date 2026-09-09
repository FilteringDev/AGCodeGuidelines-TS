/**
 * @file A rule to disallow duplicate name in class members.
 * @author Toru Nagashima
 */
import dependency0 from './utils/ast-utils';
import type { LegacyRule, Node } from '../../../types';

const astUtils = dependency0;

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow duplicate class members',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-dupe-class-members',
        },

        schema: [],

        messages: {
            unexpected: "Duplicate name '{{name}}'.",
        },
    },

    create(context) {
        let stack: Record<
            string,
            {
                static: { init: boolean; get: boolean; set: boolean };
                nonStatic: { init: boolean; get: boolean; set: boolean };
            }
        >[] = [];

        /**
         * Gets state of a given member name.
         * @param name A name of a member.
         * @param isStatic A flag which specifies that is a static member.
         * @returns A state of a given member name.
         *   - retv.init {boolean} A flag which shows the name is declared as normal member.
         *   - retv.get {boolean} A flag which shows the name is declared as getter.
         *   - retv.set {boolean} A flag which shows the name is declared as setter.
         */
        function getState(name: string, isStatic: boolean) {
            const stateMap = stack[stack.length - 1];
            const key = `$${name}`; // to avoid "__proto__".

            if (!stateMap![key]) {
                stateMap![key] = {
                    nonStatic: { init: false, get: false, set: false },
                    static: { init: false, get: false, set: false },
                };
            }

            return stateMap![key][isStatic ? 'static' : 'nonStatic'];
        }

        return {
            // Initializes the stack of state of member declarations.
            Program() {
                stack = [];
            },

            // Initializes state of member declarations for the class.
            ClassBody() {
                stack.push(Object.create(null));
            },

            // Disposes the state for the class.
            'ClassBody:exit': function onClassBodyExit() {
                stack.pop();
            },

            // Reports the node if its name has been declared already.
            'MethodDefinition, PropertyDefinition':
                function onMethodDefinitionPropertyDefinition(
                    node: Node<'MethodDefinition' | 'PropertyDefinition'>,
                ) {
                    const name = astUtils.getStaticPropertyName(node);
                    const kind = node.type === 'MethodDefinition' ? node.kind : 'field';

                    if (name === null || kind === 'constructor') {
                        return;
                    }

                    const state = getState(name, node.static);
                    let isDuplicate = false;

                    if (kind === 'get') {
                        isDuplicate = state.init || state.get;
                        state.get = true;
                    } else if (kind === 'set') {
                        isDuplicate = state.init || state.set;
                        state.set = true;
                    } else {
                        isDuplicate = state.init || state.get || state.set;
                        state.init = true;
                    }

                    if (isDuplicate) {
                        context.report({ node, messageId: 'unexpected', data: { name } });
                    }
                },
        };
    },
};

export default rule;
