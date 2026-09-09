import resolve from '../../utils/resolve.js';

export class RemotePath {
  constructor(path, context) {
    this.path = path;
    this.context = context;
  }

  resolve(value) {
    return resolve.relative(value, this.path, this.context.settings);
  }
}
