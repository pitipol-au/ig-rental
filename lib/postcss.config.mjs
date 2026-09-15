// postcss.config.mjs
//
// PROJECT ROOT, next to package.json.
//
// This is the missing link. Tailwind v4 is a PostCSS plugin: without
// this file, Next.js never runs Tailwind over your CSS, so nothing
// generates the utility classes the pages ask for. The package was
// installed; nothing was ever told to use it.
//
// Tailwind v4 only. In v3 this file also listed autoprefixer and
// needed a tailwind.config.js alongside it — v4 folds both in, which
// is why there is no tailwind.config file in this project and why one
// is not missing.

const config = {
  plugins: {
    '@tailwindcss/postcss': {},
  },
};

export default config;