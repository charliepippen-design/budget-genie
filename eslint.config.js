import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  { ignores: ["dist", "dist-qa", ".sourcemaps", ".claude"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name=/^use(Layout)?Effect$/] > ArrowFunctionExpression[expression=true]:first-child",
          message:
            "Do not use an expression-bodied arrow in useEffect/useLayoutEffect: its value is used as the cleanup. Chrome 150+ scroll APIs (scrollIntoView, scrollTo) return a Promise, which React then calls and crashes with 'n is not a function'. Use a block body: useEffect(() => { ... }, []).",
        },
        {
          selector:
            "CallExpression[callee.type='MemberExpression'][callee.property.name=/^use(Layout)?Effect$/] > ArrowFunctionExpression[expression=true]:first-child",
          message:
            "Do not use an expression-bodied arrow in React.useEffect/useLayoutEffect: its value is used as the cleanup. Chrome 150+ scroll APIs (scrollIntoView, scrollTo) return a Promise, which React then calls and crashes with 'n is not a function'. Use a block body: React.useEffect(() => { ... }, []).",
        },
      ],
    },
  },
);
