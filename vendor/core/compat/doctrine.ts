/** @file Doctrine contracts for comments parsed with source ranges enabled. */
import * as doctrine from 'doctrine';

type DocField<Value> = Value extends doctrine.Type
    ? DocKinds[Value['type']]
    : Value extends readonly unknown[]
        ? { [Key in keyof Value]: DocField<Value[Key]> }
        : Value;
type DocKinds = {
    [Kind in doctrine.Type['type']]: {
        [Key in keyof Extract<doctrine.Type, { type: Kind }>]: DocField<
            Extract<doctrine.Type, { type: Kind }>[Key]
        >;
    } & { range: [number, number] } & (Extract<doctrine.Type, { type: Kind }> extends {
        name: string;
    }
        ? unknown
        : { name?: undefined });
};
export type DocType = DocKinds[doctrine.Type['type']];
export type DocTag = Omit<doctrine.Tag, 'type'> & {
    type?: DocType | null;
    range: [number, number];
};
type ParseOptions = NonNullable<Parameters<typeof doctrine.parse>[1]> & { range: true };
type RangeParser = Omit<typeof doctrine, 'parse'> & {
    parse(content: string, options: ParseOptions): { description: string; tags: DocTag[] };
};

// Doctrine's range option adds offsets to tags and every parsed type node.
const rangedDoctrine = doctrine as unknown as RangeParser;
export default rangedDoctrine;
