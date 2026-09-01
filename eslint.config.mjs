import coreWebVitals from "eslint-config-next/core-web-vitals";
import typescript from "eslint-config-next/typescript";
import reactHooks from "eslint-plugin-react-hooks";

const eslintConfig = [
  ...coreWebVitals,
  ...typescript,
  {
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/refs": "warn",
      "react-hooks/purity": "warn",
    },
  },
  {
    ignores: [".next/**", "node_modules/**", "test-results/**", "playwright-report/**", "public/**", "scripts/**"],
  },
];

export default eslintConfig;
