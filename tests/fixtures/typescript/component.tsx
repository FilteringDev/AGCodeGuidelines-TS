/**
 * @file A typed React component and generic arrow function.
 */
import React from 'react';

interface Props {
    title: string;
}

export const identity = <Value,>(value: Value): Value => value;

/**
 * Render a title.
 * @param props Component properties.
 * @param props.title Title text.
 * @returns The rendered title.
 */
export function Title({ title }: Props): React.JSX.Element {
    return <h1>{identity(title)}</h1>;
}
