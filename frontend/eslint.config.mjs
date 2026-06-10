import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// React Compiler rules shipped with eslint-plugin-react-hooks@7 are enabled by
// eslint-config-next by default, but they only apply when the React Compiler is
// actually configured in next.config. This project does not use the compiler, so
// we disable them here to avoid false positives.
const REACT_COMPILER_RULES = {
  "react-hooks/static-components": "off",
  "react-hooks/use-memo": "off",
  "react-hooks/preserve-manual-memoization": "off",
  "react-hooks/incompatible-library": "off",
  "react-hooks/immutability": "off",
  "react-hooks/globals": "off",
  "react-hooks/refs": "off",
  "react-hooks/set-state-in-effect": "off",
  "react-hooks/error-boundaries": "off",
  "react-hooks/purity": "off",
  "react-hooks/set-state-in-render": "off",
  "react-hooks/unsupported-syntax": "off",
  "react-hooks/config": "off",
  "react-hooks/gating": "off",
};

const eslintConfig = [
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "dist/**",
      "storybook-static/**",
      "playwright-report/**",
      "stories/**",
    ],
  },
  ...coreWebVitals,
  ...nextTypescript,
  {
    rules: {
      ...REACT_COMPILER_RULES,
      // Extensive pre-existing any usage; warn rather than error until
      // addressed systematically per docs/standards/typescript-implementation.md
      "@typescript-eslint/no-explicit-any": "warn",
      // Enforce path imports for lodash to avoid full-package bundle weight.
      // Use lodash/debounce, lodash/uniq, etc. — not import { x } from 'lodash'.
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "lodash",
              message:
                "Use path imports instead (e.g. lodash/debounce, lodash/uniq).",
            },
          ],
        },
      ],
    },
  },
];

export default eslintConfig;
