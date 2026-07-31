import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";

/*
 * `next lint` was removed in Next 16, which left `npm run lint` pointing at a
 * command that no longer exists — so nothing had ever been linted. These are
 * Next's own flat configs (v16 ships them directly; FlatCompat is the old
 * path and throws against this version).
 */
const config = [
  {
    ignores: [".next/**", "node_modules/**", "drizzle/**", "next-env.d.ts"],
  },
  ...coreWebVitals,
  ...typescript,
  {
    rules: {
      // Server actions take a previous-state argument this codebase ignores.
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
];

export default config;
