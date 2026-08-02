Beast — self-hosted fonts
=========================

This folder should contain 7 files, matching the @font-face rules in
index.html and the precache list in sw.js:

  inter-400.woff2
  inter-500.woff2
  inter-600.woff2
  inter-700.woff2
  source-serif-4-500.woff2
  source-serif-4-600.woff2
  source-serif-4-700.woff2

They aren't included here because this environment has no internet access.
Run fetch-fonts.sh from a machine that does:

  cd fonts
  bash fetch-fonts.sh

That script asks Google Fonts' own css2 API for exactly the same weights
(and, for Source Serif 4, the same opsz 8..60 optical-size range) the app
already requested from the CDN, then downloads the plain-Latin woff2 Google
returns for each. It's the same file the browser was already fetching from
fonts.gstatic.com — just saved locally instead of re-fetched every visit.

License: both Inter and Source Serif 4 are distributed under the SIL Open
Font License 1.1, which permits bundling/self-hosting and redistribution
with the app. No attribution file is legally required, but keeping this
note is good practice.

Sanity check after running the script: each file should be roughly
10–120 KB (Inter ~10–30 KB per static weight, Source Serif 4 slightly
larger due to the opsz axis). If a file is 0 bytes or a few hundred bytes,
the fetch failed — check fetch-fonts.sh's stderr output.
