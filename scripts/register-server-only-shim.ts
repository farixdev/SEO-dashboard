import Module from "node:module";
import path from "node:path";

/**
 * `import "server-only"` is a marker Next's bundler resolves away. Running the
 * app's query modules in plain Node — which `verify-parity` does on purpose, so
 * it tests the real queries rather than a copy — needs it to resolve to a no-op.
 *
 * Scoped to this one specifier; everything else resolves normally.
 */
const SHIM = path.join(
  process.cwd(),
  "node_modules",
  ".parity-shim",
  "server-only",
  "index.js",
);

type Resolver = (
  request: string,
  parent: unknown,
  isMain: boolean,
  options?: unknown,
) => string;

const loader = Module as unknown as { _resolveFilename: Resolver };
const original = loader._resolveFilename;

loader._resolveFilename = function patched(request, parent, isMain, options) {
  if (request === "server-only") return SHIM;
  return original.call(this, request, parent, isMain, options);
};
