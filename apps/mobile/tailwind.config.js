/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{ts,tsx}", "../../design-system/packages/ui/src/**/*.{ts,tsx}"],
  presets: [require("@osc/ui/tailwind-preset")],
};
