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
<<<<<<< HEAD
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
=======
      // Money goes through formatMoney (CurrencyContext) so one plan currency shows everywhere.
      "no-restricted-syntax": [
        "error",
        {
          selector: "Property[key.name='style'][value.value='currency']",
          message: "Format money with formatMoney() from @/contexts/CurrencyContext, not Intl style: 'currency'.",
>>>>>>> 3e4bb74 (One plan currency: all money via formatMoney, AI told the plan currency, lint rule against ad-hoc currency formatting (N-3))
    },
      ],
    },
  },
  {
    files: ["src/contexts/CurrencyContext.tsx"],
    rules: { "no-restricted-syntax": "off" },
  },
);
