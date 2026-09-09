import { getAncestors } from '../utils/contextCompat.js';

export default function importDeclaration(context, node) {
  const ancestors = getAncestors(context, node);
  return ancestors[ancestors.length - 1];
}
