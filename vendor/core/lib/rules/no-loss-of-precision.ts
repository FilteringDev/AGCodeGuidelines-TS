/**
 * @file Rule to flag numbers that will lose significant figure precision at runtime
 * @author Jacob Moore
 */
import type { LegacyRule, Node } from '../../../types';

//------------------------------------------------------------------------------
// Rule Definition
//------------------------------------------------------------------------------

const rule: LegacyRule<[]> = {
    meta: {
        type: 'problem',

        docs: {
            description: 'Disallow literal numbers that lose precision',
            recommended: true,
            url: 'https://eslint.org/docs/latest/rules/no-loss-of-precision',
        },
        schema: [],
        messages: {
            noLossOfPrecision: 'This number literal will lose precision at runtime.',
        },
    },

    create(context) {
        /**
         * Returns whether the node is number literal
         * @param node the node literal being evaluated
         * @returns true if the node is a number literal
         */
        function isNumber(node: Node<'Literal'>) {
            return typeof node.value === 'number';
        }

        /**
         * Gets the source code of the given number literal. Removes `_` numeric separators from the result.
         * @param node the number `Literal` node
         * @returns raw source code of the literal, without numeric separators
         */
        function getRaw(node: Node<'Literal'>) {
            return node.raw!.replace(/_/gu, '');
        }

        /**
         * Checks whether the number is  base ten
         * @param node the node being evaluated
         * @returns true if the node is in base ten
         */
        function isBaseTen(node: Node<'Literal'>) {
            const prefixes = ['0x', '0X', '0b', '0B', '0o', '0O'];

            return (
                prefixes.every((prefix) => !node.raw!.startsWith(prefix))
                && !/^0[0-7]+$/u.test(node.raw!)
            );
        }

        /**
         * Checks that the user-intended non-base ten number equals the actual number after is has been converted to
         * the Number type
         * @param node the node being evaluated
         * @returns true if they do not match
         */
        function notBaseTenLosesPrecision(node: Node<'Literal'>) {
            const rawString = getRaw(node).toUpperCase();
            let base = 0;

            if (rawString.startsWith('0B')) {
                base = 2;
            } else if (rawString.startsWith('0X')) {
                base = 16;
            } else {
                base = 8;
            }

            return !rawString.endsWith(node.value!.toString(base).toUpperCase());
        }

        /**
         * Adds a decimal point to the numeric string at index 1
         * @param stringNumber the numeric string without any decimal point
         * @returns the numeric string with a decimal point in the proper place
         */
        function addDecimalPointToNumber(stringNumber: string) {
            return `${stringNumber[0]}.${stringNumber.slice(1)}`;
        }

        /**
         * Returns the number stripped of leading zeros
         * @param numberAsString the string representation of the number
         * @returns the stripped string
         */
        function removeLeadingZeros(numberAsString: string) {
            for (let i = 0; i < numberAsString.length; i += 1) {
                if (numberAsString[i] !== '0') {
                    return numberAsString.slice(i);
                }
            }
            return numberAsString;
        }

        /**
         * Returns the number stripped of trailing zeros
         * @param numberAsString the string representation of the number
         * @returns the stripped string
         */
        function removeTrailingZeros(numberAsString: string) {
            for (let i = numberAsString.length - 1; i >= 0; i -= 1) {
                if (numberAsString[i] !== '0') {
                    return numberAsString.slice(0, i + 1);
                }
            }
            return numberAsString;
        }

        /**
         * Converts an integer to an object containing the integer's coefficient and order of magnitude
         * @param stringInteger the string representation of the integer being converted
         * @returns the object containing the integer's coefficient and order of magnitude
         */
        function normalizeInteger(stringInteger: string) {
            const significantDigits = removeTrailingZeros(removeLeadingZeros(stringInteger));

            return {
                magnitude: stringInteger.startsWith('0')
                    ? stringInteger.length - 2
                    : stringInteger.length - 1,
                coefficient: addDecimalPointToNumber(significantDigits),
            };
        }

        /**
         *
         * Converts a float to an object containing the floats's coefficient and order of magnitude
         * @param stringFloat the string representation of the float being converted
         * @returns the object containing the integer's coefficient and order of magnitude
         */
        function normalizeFloat(stringFloat: string) {
            const trimmedFloat = removeLeadingZeros(stringFloat);

            if (trimmedFloat.startsWith('.')) {
                const decimalDigits = trimmedFloat.slice(1);
                const significantDigits = removeLeadingZeros(decimalDigits);

                return {
                    magnitude: significantDigits.length - decimalDigits.length - 1,
                    coefficient: addDecimalPointToNumber(significantDigits),
                };
            }
            return {
                magnitude: trimmedFloat.indexOf('.') - 1,
                coefficient: addDecimalPointToNumber(trimmedFloat.replace('.', '')),
            };
        }

        /**
         * Converts a base ten number to proper scientific notation
         * @param stringNumber the string representation of the base ten number to be converted
         * @returns the number converted to scientific notation
         */
        function convertNumberToScientificNotation(stringNumber: string) {
            const splitNumber = stringNumber.replace('E', 'e').split('e');
            const originalCoefficient = splitNumber[0];
            const normalizedNumber = stringNumber.includes('.')
                ? normalizeFloat(originalCoefficient!)
                : normalizeInteger(originalCoefficient!);
            const normalizedCoefficient = normalizedNumber.coefficient;
            const magnitude = splitNumber.length > 1
                ? parseInt(splitNumber[1]!, 10) + normalizedNumber.magnitude
                : normalizedNumber.magnitude;

            return `${normalizedCoefficient}e${magnitude}`;
        }

        /**
         * Checks that the user-intended base ten number equals the actual number after is has been converted to the
         * Number type
         * @param node the node being evaluated
         * @returns true if they do not match
         */
        function baseTenLosesPrecision(node: Node<'Literal'>) {
            const normalizedRawNumber = convertNumberToScientificNotation(getRaw(node));
            const requestedPrecision = normalizedRawNumber!
                .split('e')[0]!
                .replace('.', '').length;

            if (requestedPrecision > 100) {
                return true;
            }
            const storedNumber = (node.value as number).toPrecision(requestedPrecision);
            const normalizedStoredNumber = convertNumberToScientificNotation(storedNumber);

            return normalizedRawNumber !== normalizedStoredNumber;
        }

        /**
         * Checks that the user-intended number equals the actual number after is has been converted to the Number
         * type
         * @param node the node being evaluated
         * @returns true if they do not match
         */
        function losesPrecision(node: Node<'Literal'>) {
            return isBaseTen(node)
                ? baseTenLosesPrecision(node)
                : notBaseTenLosesPrecision(node);
        }

        return {
            Literal(node: Node<'Literal'>) {
                if (node.value && isNumber(node) && losesPrecision(node)) {
                    context.report({
                        messageId: 'noLossOfPrecision',
                        node,
                    });
                }
            },
        };
    },
};

export default rule;
