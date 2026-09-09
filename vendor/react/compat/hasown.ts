/**
 * @file Retain declared property types when checking own keys across option unions.
 */
import hasOwn from 'hasown';

type Field<Object, Key extends PropertyKey> = Object extends unknown
    ? Key extends keyof Object
        ? Object[Key]
        : never
    : never;
type PresentField<Object, Key extends PropertyKey> = [Field<Object, Key>] extends [never]
    ? unknown
    : Field<Object, Key>;
interface OwnPropertyCheck {
    <Object extends object>(object: string extends keyof Object ? Object : never, key: string): boolean;
    <Object extends object, Key extends PropertyKey>(
        object: Object,
        key: Key,
    ): object is Object & {
        [Name in Key]: PresentField<Object, Name>;
    };
}

// The pinned helper checks ownership without changing the value of an existing property.
export default hasOwn as OwnPropertyCheck;
