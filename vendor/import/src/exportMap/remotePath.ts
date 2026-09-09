import type { ParserContext } from '../../types';
import { relative } from '../../utils/resolve';

export default class RemotePath {
    path: string;

    context: ParserContext;

    constructor(path: string, context: ParserContext) {
        this.path = path;
        this.context = context;
    }

    resolve(value: string) {
        return relative(value, this.path, this.context.settings);
    }
}
