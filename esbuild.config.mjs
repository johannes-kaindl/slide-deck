// Build → main.js (PROF-TS-02). obsidian/electron sind extern (vom Host bereitgestellt).
import esbuild from "esbuild";
import { readFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";

const prod = process.argv.includes("--production");

// Inline KaTeX's woff2 fonts as data-URIs (and drop the woff/ttf fallbacks) so math
// renders with correct glyph metrics in both the live preview and the self-contained
// export. Without this, the bundled katex.min.css references url(fonts/…) that do not
// exist at runtime → ERR_FILE_NOT_FOUND and fallback-font math.
const inlineKatexFonts = {
  name: "inline-katex-fonts",
  setup(build) {
    build.onLoad({ filter: /katex[\\/]dist[\\/]katex\.min\.css$/ }, async (args) => {
      const css = await readFile(args.path, "utf8");
      const fontsDir = join(dirname(args.path), "fonts");
      const contents = css.replace(
        /url\(fonts\/([A-Za-z0-9_-]+)\.woff2\) format\("woff2"\),url\(fonts\/[A-Za-z0-9_-]+\.woff\) format\("woff"\),url\(fonts\/[A-Za-z0-9_-]+\.ttf\) format\("truetype"\)/g,
        (_m, name) => {
          const b64 = readFileSync(join(fontsDir, `${name}.woff2`)).toString("base64");
          return `url(data:font/woff2;base64,${b64}) format("woff2")`;
        },
      );
      return { contents, loader: "text" };
    });
  },
};

const ctx = await esbuild.context({
  entryPoints: ["src/main.ts"],
  bundle: true,
  external: ["obsidian", "electron"],
  format: "cjs",
  target: "es2022",
  sourcemap: prod ? false : "inline",
  minify: prod,
  treeShaking: true,
  outfile: "main.js",
  loader: { ".css": "text" },
  plugins: [inlineKatexFonts],
});

if (prod) {
  await ctx.rebuild();
  await ctx.dispose();
} else {
  await ctx.watch();
  console.log("esbuild: watching…");
}
