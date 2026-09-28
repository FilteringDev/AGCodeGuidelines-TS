/**
 * @file Structural, operator, and syntax boundary cases for the custom rules.
 */
import type { RuleTester } from 'oxlint/plugins-dev';

export interface CustomCase {
    rule: string;
    name: string;
    code: string;
    errors: number;
    lang: 'jsx' | 'tsx';
    options?: RuleTester.ValidTestCase['options'];
}

export const customCases: CustomCase[] = [];

// Builds template substitutions in fixture source text without writing `${` inside a string literal.
const DOLLAR = '$';

/**
 * Register a distinct custom-rule input and its expected diagnostic count.
 * @param rule - Custom rule name.
 * @param name - Behavior under test.
 * @param code - Source text.
 * @param errors - Expected diagnostics.
 * @param lang - Parser language.
 * @param options - Rule options.
 */
function add(
    rule: string,
    name: string,
    code: string,
    errors: number,
    lang: 'jsx' | 'tsx' = 'jsx',
    options?: CustomCase['options'],
): void {
    customCases.push({
        rule,
        name,
        code,
        errors,
        lang,
        ...(options ? { options } : {}),
    });
}

const prototypeTargets = [
    'Widget.prototype',
    'Widget.prototype.value',
    'Widget["prototype"]',
    "Widget['prototype'].value",
    'Widget.prototype[slot]',
    'namespace.Widget.prototype.value',
    'Widget.prototype.deep.value',
    'Widget["prototype"]["value"]',
    'factory().prototype.value',
    'Widget.prototype[Symbol.iterator]',
];
const ordinaryTargets = [
    'Widget.value',
    'Widget[slot]',
    'Widget["proto"]',
    'Widget.value.prototypeName',
    'Widget[prototype]',
    'Widget["prototype" + suffix]',
];
const assignments = [
    '=',
    '+=',
    '-=',
    '*=',
    '/=',
    '%=',
    '**=',
    '<<=',
    '>>=',
    '>>>=',
    '&=',
    '^=',
    '|=',
    '&&=',
    '||=',
    '??=',
];

for (const [invalid, targets] of [
    [true, prototypeTargets],
    [false, ordinaryTargets],
] as const) {
    for (const target of targets) {
        for (const operator of assignments) {
            add('no-prototype-mutation', `${target} ${operator}`, `${target} ${operator} value;`, invalid ? 1 : 0);
        }
        for (const expression of [`++${target}`, `${target}++`, `--${target}`, `${target}--`, `delete ${target}`]) {
            add('no-prototype-mutation', expression, `${expression};`, invalid ? 1 : 0);
        }
    }
}
[
    'Widget.prototype.value;',
    'const saved = Widget.prototype;',
    'typeof Widget.prototype;',
    'void Widget.prototype;',
    'function update(value) { value += 1; return value; }',
    'const holder = { prototype: {} };',
].forEach((code) => {
    add('no-prototype-mutation', `read or declaration: ${code}`, code, 0);
});

const defaultMutations = [
    'count = 1',
    'count += 1',
    'count -= 1',
    'count *= 2',
    'count **= 2',
    'count ||= 1',
    'count &&= 1',
    'count ??= 1',
    'count++',
    '++count',
    'count--',
    '--count',
];
const defaultPositions = [
    (value: string) => `(${value})`,
    (value: string) => `consume(${value})`,
    (value: string) => `enabled ? (${value}) : 0`,
    (value: string) => `[(${value})]`,
    (value: string) => `({ value: (${value}) })`,
];
for (const mutation of defaultMutations) {
    for (const [position, wrap] of defaultPositions.entries()) {
        const value = wrap(mutation);
        for (const parameter of [`argument = ${value}`, `{ argument = ${value} }`, `[argument = ${value}]`]) {
            add(
                'no-default-side-effects',
                `${mutation}; position ${position}; ${parameter}`,
                `function consumeDefault(${parameter}) { return argument; }`,
                1,
            );
        }
    }
    for (const deferred of [`() => { ${mutation}; }`, `function later() { ${mutation}; }`]) {
        add(
            'no-default-side-effects',
            `deferred ${deferred}`,
            `function example(callback = ${deferred}) { return callback; }`,
            0,
        );
    }
    add('no-default-side-effects', `ordinary body ${mutation}`, `function example() { ${mutation}; }`, 0);
}
[
    'function example(value = 1) {}',
    'function example(value = external()) {}',
    'const { value = 1 } = source;',
    'const [value = 1] = source;',
].forEach((code) => {
    add('no-default-side-effects', `no local mutation: ${code}`, code, 0);
});

const enumNames = [
    ['Color', true],
    ['HTTPStatus', true],
    ['Status2', true],
    ['X', true],
    ['ReadOnly', true],
    ['URLValue', true],
    ['ColorMode', true],
    ['Value0', true],
    ['COLOR', false],
    ['color', false],
    ['colorMode', false],
    ['Color_Mode', false],
    ['_Color', false],
    ['Color_', false],
    ['$Color', false],
    ['URL', false],
    ['C0L0R', false],
    ['V1', true],
    ['H2', true],
    ['IO', false],
    ['MV3', false],
    ['c', false],
    ['C_o_l_o_r', false],
    ['color_mode', false],
] as const;
for (const [name, valid] of enumNames) {
    for (const prefix of ['', 'export ', 'declare ', 'const ']) {
        add(
            'enum-name',
            `${prefix}enum identifier ${name}`,
            `${prefix}enum ${name} { Red = 'red' }`,
            valid ? 0 : 1,
            'tsx',
        );
        add(
            'enum-name',
            `${prefix}enum member ${name}`,
            `${prefix}enum Color { ${name} = 'red' }`,
            valid ? 0 : 1,
            'tsx',
        );
    }
    add('enum-name', `quoted member ${name}`, `enum Color { '${name}' = 'arbitrary value' }`, valid ? 0 : 1, 'tsx');
}
add('enum-name', 'template member', 'enum Color { [`Key`] = \'red\' }', 0, 'tsx');

const catchForms = [
    ['catch {}', 0],
    ['catch (error) {}', 0],
    ['catch (error: unknown) {}', 0],
    ['catch (error: /* explanation */ unknown) {}', 0],
    ['catch (error: any) {}', 1],
    ['catch (error: /* explanation */ any) {}', 1],
    ['catch (error:\nany) {}', 1],
    ['catch ({ message }) {}', 0],
    ['catch ([first]) {}', 0],
    ['catch ({ message }: any) {}', 1],
    ['catch ([first]: any) {}', 1],
    ['catch ({ message }: unknown) {}', 0],
    ['catch (error: any | unknown) {}', 1],
    ['catch (error: unknown | any) {}', 1],
    ['catch (error: unknown | Error) {}', 0],
] as const;
for (const [form, errors] of catchForms) {
    for (const [context, wrap] of [
        ['top-level', (code: string) => code],
        ['function', (code: string) => `function example() { ${code} }`],
        ['method', (code: string) => `class Example { run() { ${code} } }`],
        ['async', (code: string) => `async function example() { ${code} }`],
    ] as const) {
        add('unknown-catch', `${context}: ${form}`, wrap(`try { attempt(); } ${form}`), errors, 'tsx');
    }
}

for (const key of ['value', '[key]', '"value"', '42']) {
    for (const kind of ['get', 'set']) {
        const member = kind === 'get' ? `${kind} ${key}() { return stored; }` : `${kind} ${key}(next) { stored = next; }`;
        for (const [context, code] of [
            ['object', `const object = { ${member} };`],
            ['class', `class Example { ${member} }`],
            ['static class', `class Example { static ${member} }`],
            ['class expression', `const Example = class { ${member} };`],
        ]) {
            add('no-accessors', `${context} ${kind} ${key}`, code!, 1);
        }
    }
}
[
    'const object = { getValue() { return stored; } };',
    'class Example { setValue(next) { stored = next; } }',
    'const object = { get: callback, set: callback };',
    'class Example { get = callback; set = callback; }',
    'class Example { #value = 1; get #stored() { return this.#value; } }',
].forEach((code, index) => {
    add('no-accessors', code, code, index === 4 ? 1 : 0);
});

for (const [array, invalid] of [
    ['[...items]', true],
    ['[]', false],
    ['[...items, tail]', false],
    ['[head, ...items]', false],
    ['[...first, ...second]', false],
    ['items', false],
] as const) {
    for (const member of ['.map', '["map"]', "['map']", '?.map']) {
        for (const args of ['mapper', '(value) => value', 'mapper, receiver']) {
            const code = `${array}${member}(${args});`;
            add('prefer-array-from-map', code, code, invalid ? 1 : 0);
        }
    }
}
[
    '[...items].map();',
    '[...items].filter(mapper);',
    'Array.from(items, mapper);',
    '[...items][method](mapper);',
    'map(...items);',
    '([...items].map);',
].forEach((code) => {
    add('prefer-array-from-map', code, code, 0);
});

for (const code of [
    'export { value } from "module";',
    'export { value as renamed } from "module";',
    'export * from "module";',
    'export * as namespace from "module";',
    'export {} from "module";',
    'export { default as value } from "module";',
    'export type { Value } from "module";',
]) {
    add('no-direct-reexport', code, code, 1, 'tsx');
}
for (const code of [
    'const value = 1; export { value };',
    'export const value = 1;',
    'export default function example() {}',
    'import { value } from "module"; export { value };',
    'export interface Value {}',
    'export {};',
]) {
    add('no-direct-reexport', code, code, 0, 'tsx');
}

for (const newline of ['\n', '\r\n', '\r']) {
    for (const [opening, errors] of [
        ['/*', 1],
        ['/**', 0],
        ['/***', 0],
    ] as const) {
        const comment = `${opening} comment${newline} * second line${newline} */`;
        for (const code of [comment, `function example() { ${comment} }`, `const value = 1; ${comment}`]) {
            add('require-docblock', `${opening} ${JSON.stringify(newline)} ${code}`, code, errors);
        }
    }
}
[
    '/* one line */',
    '// line comment\n// second comment',
    '/** one line */',
    'const value = 1;',
    '/* before */ const value = 1; /* after */',
].forEach((code) => add('require-docblock', code, code, 0));

[
    ['abstract getter', 'abstract class Shape { abstract get area(): number; }', 1],
    ['abstract setter', 'abstract class Shape { abstract set area(next: number); }', 1],
    ['interface accessors', 'interface Shape { get area(): number; set area(next: number); }', 2],
    ['type literal getter', 'type Shape = { get area(): number };', 1],
    ['auto-accessor', 'class Counter { accessor count = 0; }', 1],
    ['static auto-accessor', 'class Counter { static accessor count = 0; }', 1],
    ['abstract auto-accessor', 'abstract class Counter { abstract accessor count: number; }', 1],
    ['abstract method', 'abstract class Shape { abstract getArea(): number; }', 0],
    ['interface method', 'interface Shape { getArea(): number; }', 0],
    ['interface property', 'interface Shape { area: number; }', 0],
    ['type literal method', 'type Shape = { getArea(): number };', 0],
].forEach(([name, code, errors]) => {
    add('no-accessors', `TypeScript ${name as string}`, code as string, errors as number, 'tsx');
});

for (const [name, code, errors] of [
    ['two literals', "const message = 'first part '\n    + 'second part';", 1],
    ['operator at line end', "const message = 'first part ' +\n    'second part';", 1],
    ['three literals', "const message = 'first '\n    + 'second '\n    + 'third';", 1],
    ['templates', 'const message = `first `\n    + `second`;', 1],
    ['argument', "report('first part '\n    + 'second part');", 1],
    ['literal after value', "const message = prefix + 'first '\n    + 'second';", 1],
    ['same line', "const message = 'first ' + 'second';", 0],
    ['value then literal', "const message = prefix\n    + 'second';", 0],
    ['literal then value', "const message = 'first '\n    + suffix;", 0],
    ['substitution', `const message = \`first ${DOLLAR}{value}\`\n    + 'second';`, 0],
    ['numbers', 'const total = 1\n    + 2;', 0],
    ['subtraction', "const value = 'first'\n    - 'second';", 0],
    ['separated by value', "const message = 'first '\n    + value\n    + 'second';", 0],
] as const) {
    add('no-multiline-string-concat', name, code, errors);
}

const layouts = [
    ['operator continues first line', 'if (first === 1\n    && second === 2) {\n    work();\n}', 1],
    ['closing parenthesis after condition', 'if (\n    first\n    && second) {\n    work();\n}', 1],
    ['condition starts after parenthesis', 'if (first\n    && second\n) {\n    work();\n}', 1],
    ['while', 'while (first\n    || second) {\n    work();\n}', 1],
    ['do while', 'do {\n    work();\n} while (first\n    && second);', 1],
    ['do while without semicolon', 'do {\n    work();\n} while (first\n    && second)', 1],
    ['grouped operand', 'if ((first || second)\n    && third) {\n    work();\n}', 1],
    ['good if', 'if (\n    first === 1\n    && second === 2\n) {\n    work();\n}', 0],
    ['good while', 'while (\n    first\n    || second\n) {\n    work();\n}', 0],
    ['good do while', 'do {\n    work();\n} while (\n    first\n    && second\n);', 0],
    ['single line', 'if (first && second) {\n    work();\n}', 0],
    ['multiline call', 'if (check({\n    first,\n})) {\n    work();\n}', 0],
    ['negated group', 'if (!(first\n    && second)) {\n    work();\n}', 0],
    ['single line while', 'while (first || second) {\n    work();\n}', 0],
] as const;
for (const [name, code, errors] of layouts) {
    add('multiline-condition-layout', name, code, errors);
}
add('multiline-condition-layout', 'type assertion', 'if ((first\n    && second) as boolean) {\n    work();\n}', 1, 'tsx');

for (const [code, errors] of [
    ["const childCombinator = '>';", 1],
    ['export const maxSize = 10;', 1],
    ['const offset = -1;', 1],
    ['const limit = 10n;', 1],
    ['const enabled = true;', 1],
    ['const label = `text`;', 1],
    ["const first = 'a', SECOND = 'b';", 1],
    ["const _PRIVATE = 'a';", 1],
    ["const CHILD_COMBINATOR = '>';", 0],
    ['export const MAX_SIZE_2 = 10;', 0],
    ['const X = 1;', 0],
    ['const value = compute();', 0],
    ['let counter = 0;', 0],
    ['function run() { const local = 1; return local; }', 0],
    ['const { first } = source;', 0],
    ['const pattern = /x/u;', 0],
    ['const empty = null;', 0],
    [`const label = \`${DOLLAR}{value}\`;`, 0],
    ['const items = [];', 0],
    ['const negated = !flag;', 0],
    ['const declared = undefined;', 0],
    ['export default 1;', 0],
    ['const value = compute();\nexport { value };', 0],
] as const) {
    add('constant-name', code, code, errors);
}
for (const [code, errors] of [
    ["const mode = 'light' as const;", 1],
    ['const size = 1 satisfies number;', 1],
    ['const size = (1 as number)!;', 1],
    ["const MODE = 'light' as const;", 0],
] as const) {
    add('constant-name', `TypeScript ${code}`, code, errors, 'tsx');
}

const runs = { lineCommentRuns: true };
for (const [name, code, errors] of [
    ['two lines', '// first\n// second\nwork();', 1],
    ['three lines', '// first\n// second\n// third\nwork();', 1],
    ['two runs', '// first\n// second\n\n// third\n// fourth\nwork();', 2],
    ['indented run', 'function run() {\n    // first\n    // second\n    work();\n}', 1],
    ['single line', '// only\nwork();', 0],
    ['separated', '// first\nwork();\n// second\nwork();', 0],
    ['blank line', '// first\n\n// second\nwork();', 0],
    ['trailing comment', 'work(); // trailing\n// next\nwork();', 0],
    ['directive', '// eslint-disable-next-line no-console\n// explains\nwork();', 0],
    ['oxlint directive', '// oxlint-disable-next-line no-console\n// explains\nwork();', 0],
    ['triple slash', '/// <reference path="first.d.ts" />\n/// <reference path="second.d.ts" />', 0],
    ['block between', '// first\n/* second */\n// third\nwork();', 0],
    ['multiline block', '/* first\n   second */\nwork();', 1],
] as const) {
    add('require-docblock', `line runs: ${name}`, code, errors, 'jsx', [runs]);
}
add('require-docblock', 'line runs disabled explicitly', '// alpha\n// beta\nwork();', 0, 'jsx', [{ lineCommentRuns: false }]);

for (const [code, errors] of [
    ['function count(first = delete source.key) { return first; }', 1],
    ['function count(first = typeof source) { return first; }', 0],
] as const) {
    add('no-default-side-effects', `delete: ${code}`, code, errors);
}

const prototypeCalls = { calls: true };
for (const [code, errors] of [
    ['Object.assign(Queue.prototype, { pop() {} });', 1],
    ["Object.defineProperty(Queue.prototype, 'size', { value: 1 });", 1],
    ['Object.defineProperties(Queue.prototype, {});', 1],
    ["Reflect.defineProperty(Queue.prototype, 'size', { value: 1 });", 1],
    ['Object.setPrototypeOf(PeekableQueue, Queue);', 1],
    ['Reflect.setPrototypeOf(PeekableQueue, Queue);', 1],
    ['inherits(PeekableQueue, Queue);', 1],
    ['util.inherits(PeekableQueue, Queue);', 1],
    ['Object.assign(target, { pop() {} });', 0],
    ["Object.defineProperty(target, 'size', { value: 1 });", 0],
    ['Object.assign();', 0],
    ['queue[method](Queue.prototype);', 0],
] as const) {
    add('no-prototype-mutation', `calls: ${code}`, code, errors, 'jsx', [prototypeCalls]);
}
add('no-prototype-mutation', 'calls disabled by default', 'Object.setPrototypeOf(Child, Parent);', 0);

for (const [code, errors] of [
    ['const list = Array.prototype.slice.call(arrayLike);', 1],
    ['const list = [].slice.call(arrayLike);', 1],
    ['const list = Array.prototype.slice.apply(arrayLike);', 1],
    ["const list = Array.prototype['slice'].call(arrayLike);", 1],
    ['const list = Array.prototype.slice.call(arrayLike, 1);', 0],
    ['const list = Array.from(arrayLike);', 0],
    ['const list = items.slice.call(arrayLike);', 0],
    ['const list = [1].slice.call(arrayLike);', 0],
    ['const list = Array.prototype.map.call(arrayLike, convert);', 0],
    ['const list = factory().slice.call(arrayLike);', 0],
] as const) {
    add('prefer-array-from', code, code, errors);
}

for (const [code, errors] of [
    ["const text = ['How are you, ', name, '?'].join();", 1],
    ["const text = ['How are you, ', name, '?'].join('');", 1],
    ["const text = [greeting, '!'].join('');", 1],
    ["const text = ['How are you, ', name, '?'].join(' ');", 0],
    ["const text = ['a', 'b'].join('');", 0],
    ['const text = [first, second].join();', 0],
    ["const text = ['a', ...rest].join('');", 0],
    ["const text = ['a', , first].join('');", 0],
    ["const text = parts.join('');", 0],
    ["const text = ['a', first].concat();", 0],
    ["const text = ['a', first].join('', extra);", 0],
] as const) {
    add('prefer-template-over-join', code, code, errors);
}

for (const [code, errors] of [
    ['function count() { return arguments.length; }', 1],
    ['const count = function () { return arguments.callee; };', 1],
    ['function outer() { return () => arguments.length; }', 1],
    ['const count = (...args) => args.length;', 0],
    ['function first() { return arguments[0]; }', 0],
    ['const size = arguments.length;', 0],
    ['function run(options) { return options.arguments.length; }', 0],
] as const) {
    add('no-arguments', code, code, errors);
}

for (const [code, errors] of [
    ['/**\n *make() returns a new element\n */', 1],
    ['/**\n * make() returns a new element\n *based on the tag\n */', 1],
    ['/**\n * make() returns a new element\n */', 0],
    ['/**\n *\n * Blank line above.\n */', 0],
    ['/**\n **** banner ****\n */', 0],
    ['/** single line */', 0],
    ['/*\n *not a doc comment\n */', 0],
    ['// line comment', 0],
] as const) {
    add('docblock-spacing', JSON.stringify(code), code, errors);
}

for (const [name, code, errors] of [
    ['action items', '// TODO(author): first\n// continues\nwork();', 0],
    ['fix item later in run', '// Explains the next line.\n// FIXME: broken\nwork();', 0],
    ['preserved banner', '/*!\n * Copyright\n */\nwork();', 0],
    ['block directive', '/* eslint-disable\n    no-console,\n    no-alert\n*/\nwork();', 0],
] as const) {
    add('require-docblock', `line runs: ${name}`, code, errors, 'jsx', [runs]);
}

for (const [name, code, errors] of [
    ['operands on one line', 'if (first && check(\n    second,\n)) {\n    work();\n}', 0],
    ['nested operands on separate lines', 'if (first && (second\n    || third)) {\n    work();\n}', 1],
] as const) {
    add('multiline-condition-layout', name, code, errors);
}
