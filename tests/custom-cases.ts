/**
 * @file Structural, operator, and syntax boundary cases for the custom rules.
 */
export interface CustomCase {
    rule: string;
    name: string;
    code: string;
    errors: number;
    lang: 'jsx' | 'tsx';
}

export const customCases: CustomCase[] = [];

/**
 * Register a distinct custom-rule input and its expected diagnostic count.
 * @param rule - Custom rule name.
 * @param name - Behavior under test.
 * @param code - Source text.
 * @param errors - Expected diagnostics.
 * @param lang - Parser language.
 */
function add(rule: string, name: string, code: string, errors: number, lang: 'jsx' | 'tsx' = 'jsx'): void {
    customCases.push({
        rule,
        name,
        code,
        errors,
        lang,
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
