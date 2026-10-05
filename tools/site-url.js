// Vite plugin: share cards need an absolute og:image, which needs the address the site is served from.
// Build with ROADGUARD_SITE_URL=https://your.domain to get one; without it the path stays relative (local use).
export function siteUrl() {
  const base = (process.env.ROADGUARD_SITE_URL || "").replace(/\/+$/, "");
  return {
    name: "roadguard-site-url",
    transformIndexHtml(html) {
      if (!base) return html;
      return html
        .replace('content="/og.png"', `content="${base}/og.png"`)
        .replace("</head>", `  <meta property="og:url" content="${base}/" />\n  </head>`);
    },
  };
}
