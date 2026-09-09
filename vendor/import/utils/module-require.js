'use strict';
exports.__esModule=true;
exports.default=function moduleRequire(specifier){return require(specifier);};

// Preserve Babel default exports when the isolated sources are bundled as native ESM.
if (exports.default && (typeof exports.default === "function" || typeof exports.default === "object")) {
  module.exports = Object.assign(exports.default, exports);
}
