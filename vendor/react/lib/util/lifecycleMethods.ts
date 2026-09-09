/**
 * @file lifecycle methods
 * @author Tan Nguyen
 */

export default {
    instance: [
        'getDefaultProps',
        'getInitialState',
        'getChildContext',
        'componentWillMount',
        'UNSAFE_componentWillMount',
        'componentDidMount',
        'componentWillReceiveProps',
        'UNSAFE_componentWillReceiveProps',
        'shouldComponentUpdate',
        'componentWillUpdate',
        'UNSAFE_componentWillUpdate',
        'getSnapshotBeforeUpdate',
        'componentDidUpdate',
        'componentDidCatch',
        'componentWillUnmount',
        'render',
    ],
    static: ['getDerivedStateFromProps'],
};
