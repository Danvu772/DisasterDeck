#!/bin/sh
# Emits real .d.ts for the converter (synth mode has none). Output is gitignored.
set -e
cd "$(dirname "$0")/.."
rm -rf dist/types
npx tsc -p .design-sync/tsconfig.json
# The converter's checker has no tsconfig paths, so turn @/ into relative imports.
sed -i '' 's#from "@/#from "../#g' dist/types/components/*.d.ts
# Types entry: every component module (skip non-component helpers).
for f in dist/types/components/[A-Z]*.d.ts; do
  echo "export * from \"./components/$(basename "$f" .d.ts)\";"
done > dist/types/index.d.ts
