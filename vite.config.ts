import { defineConfig } from "vite";

// GitHub Pages icin taban yol: /<repo-adi>/
// Yerel gelistirmede "/" kullanilir.
const base = process.env.GITHUB_PAGES === "true" ? "/Metin2-benzeri-oyun-mobil/" : "/";

export default defineConfig({
  base,
  server: { host: true, port: 5173 },
  build: {
    target: "es2020",
    outDir: "dist",
    sourcemap: false,
    rollupOptions: {
      // Oyun + gelistirici varlik galerisi
      input: {
        main: "index.html",
        props: "props.html",
        map: "map.html",
        border: "border.html",
      },
    },
  },
});
