// Vite plugin: inline the entry stylesheet into index.html at build time.
// In its own request, the stylesheet (about 15 KB gzipped) holds back first paint for a full round trip on a slow
// connection; inline, the page paints as soon as the HTML arrives. Stylesheets of lazy chunks stay separate files.
const LINK = /<link\b[^>]*rel="stylesheet"[^>]*href="\/?(assets\/[^"]+\.css)"[^>]*>/g;

export function inlineCss() {
  return {
    name: "roadguard-inline-css",
    apply: "build",
    enforce: "post",
    transformIndexHtml: {
      order: "post",
      handler(html, ctx) {
        if (!ctx.bundle) return html;
        return html.replace(LINK, (tag, file) => {
          const asset = ctx.bundle[file];
          return asset?.type === "asset" ? `<style>${String(asset.source)}</style>` : tag;
        });
      },
    },
  };
}
