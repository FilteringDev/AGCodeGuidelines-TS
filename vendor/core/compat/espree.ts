/** @file The public Espree tokenizer returns named token kinds and string values. */
import * as espree from 'espree';
import type { Token } from '../../types';

type LexicalToken = Pick<Token, 'type' | 'value'> & { start: number; end: number };
type Tokenizer = Omit<typeof espree, 'tokenize'> & {
    tokenize(code: string, options?: Parameters<typeof espree.tokenize>[1]): LexicalToken[];
};

// The dependency declaration describes Acorn's internal tokens instead of Espree's exported tokens.
const tokenizer = espree as unknown as Tokenizer;
export default tokenizer;
