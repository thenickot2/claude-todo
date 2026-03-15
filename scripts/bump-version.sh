#!/usr/bin/env bash
set -euo pipefail

VERSION="${1:-}"

if [[ ! "$VERSION" =~ ^[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
  echo "Usage: ./scripts/bump-version.sh <version>"
  echo "Example: ./scripts/bump-version.sh 0.2.0"
  exit 1
fi

# Update version in all three config files
node -e "
const fs = require('fs');
const v = '$VERSION';

// Update package.json
const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
pkg.version = v;
fs.writeFileSync('package.json', JSON.stringify(pkg, null, 2) + '\n');

// Update src-tauri/tauri.conf.json
const tauri = JSON.parse(fs.readFileSync('src-tauri/tauri.conf.json', 'utf8'));
tauri.version = v;
fs.writeFileSync('src-tauri/tauri.conf.json', JSON.stringify(tauri, null, 2) + '\n');

// Update src-tauri/Cargo.toml
let cargo = fs.readFileSync('src-tauri/Cargo.toml', 'utf8');
cargo = cargo.replace(/^version = \".*\"/m, 'version = \"' + v + '\"');
fs.writeFileSync('src-tauri/Cargo.toml', cargo);
"

# Generate changelog
git-cliff --tag "v$VERSION" -o CHANGELOG.md

echo "Bumped version to $VERSION in:"
echo "  - package.json"
echo "  - src-tauri/tauri.conf.json"
echo "  - src-tauri/Cargo.toml"
echo "  - CHANGELOG.md"
echo ""
echo "Next steps:"
echo "  git add package.json src-tauri/tauri.conf.json src-tauri/Cargo.toml CHANGELOG.md"
echo "  git commit -m 'chore(release): v$VERSION'"
echo "  git tag v$VERSION"
echo "  git push origin main --tags"
