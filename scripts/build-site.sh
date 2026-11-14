#!/usr/bin/env bash
#
# Assemble the Valiant360 demo site into _site for GitHub Pages.
#
# WebXR requires a secure context, so the player is published over the HTTPS
# Pages origin (https://neuhaus.github.io/Valiant360/) where a headset such as
# the Meta Quest can start an immersive session.
#
# This mirrors the project's original Grunt build (concat + less + copy) but
# without Grunt, whose 0.4.x toolchain no longer runs on current Node.
set -euo pipefail

root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

out="_site"
rm -rf "$out"
mkdir -p "$out/js" "$out/css/fonts"

# Bundle the WebGL feature detector with the plugin (Grunt `concat` target).
cat src/lib/Detector.js src/valiant.jquery.js > "$out/jquery.valiant360.js"

# Compile the LESS stylesheet (Grunt `less` target).
npx --yes less@3.13.1 src/css/valiant360.less "$out/css/valiant360.css"
cp src/css/fonts/* "$out/css/fonts/"

# Vendored libraries loaded by the demo page.
cp demo/js/jquery-1.7.2.min.js "$out/js/"
cp demo/js/three.min.js "$out/js/"

# The demo page and its equirectangular media.
cp build/demo.html "$out/index.html"
cp build/equirectangular-screenshot.jpg build/overpass-clip.mp4 "$out/"

echo "Site assembled in $out/"
