'use strict';

const path = require('path');
const pkgUp = require('./pkgUp').default;

exports.__esModule = true;

/** @type {import('./pkgDir').default} */
exports.default = function (cwd) {
  const fp = pkgUp({ cwd });
  return fp ? path.dirname(fp) : null;
};

// Preserve Babel default exports when the isolated sources are bundled as native ESM.
if (exports.default && (typeof exports.default === "function" || typeof exports.default === "object")) {
  module.exports = Object.assign(exports.default, exports);
}
