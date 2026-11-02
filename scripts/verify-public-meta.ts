import { verifyPublicMeta } from "../tests/seo/public-meta-contract";

// HTTP-only regression for robots.txt, sitemap.xml, page metadata and share images.
// Never launches a browser and refuses anything but an isolated loopback application.
const base = new URL(process.argv[2] ?? "http://127.0.0.1:3000");
if (!["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) || base.username || base.password || !["http:", "https:"].includes(base.protocol)) {
  throw new Error("Public metadata regression requires an isolated loopback application origin.");
}

// Run against a freshly started server: every sitemap URL, detail pages included, must answer 200.
verifyPublicMeta(base)
  .then((summary) => {
    if (summary.pagesChecked !== summary.sitemapUrls) throw new Error(`checked ${summary.pagesChecked} of ${summary.sitemapUrls} sitemap pages`);
    console.info(JSON.stringify(summary));
  })
  .catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : "Public metadata regression failed");
    process.exitCode = 1;
  });
