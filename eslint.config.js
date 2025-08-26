import js from "@eslint/js";
import tseslint from "typescript-eslint";
import pluginImport from "eslint-plugin-import";

export default tseslint.config(
    js.configs.recommended,
    ...tseslint.configs.recommended,
    {
        plugins: { import: pluginImport },
        rules: {
            "import/order": ["error", { "newlines-between": "always" }],
        },
    },
    // Prettier compatibility (turn off conflicting rules)
    { rules: { "arrow-body-style": "off", "prefer-arrow-callback": "off" } }
);
