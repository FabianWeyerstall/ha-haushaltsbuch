// Static check of the panel files: every name used must be defined or
// imported. Catches a forgotten import after moving code between files.
import globals from "globals";

export default [
  {
    files: ["custom_components/haushaltsbuch/frontend/*.js"],
    languageOptions: { ecmaVersion: 2024, sourceType: "module", globals: { ...globals.browser } },
    rules: { "no-undef": "error", "no-redeclare": "error", "no-dupe-class-members": "error", "no-dupe-keys": "error", "no-unreachable": "error" },
  },
];
