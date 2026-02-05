#!/bin/bash
echo "=== Fixing .expo/web permissions ==="
# Remove any existing .expo directory that might have wrong permissions
rm -rf .expo 2>/dev/null || true
# Try creating directly
mkdir -p .expo/web/cache/production/images 2>/dev/null
if [ $? -ne 0 ]; then
  echo "Direct mkdir failed, using /tmp symlink"
  mkdir -p /tmp/expo-web-cache/cache/production/images
  mkdir -p .expo 2>/dev/null || true
  ln -sf /tmp/expo-web-cache .expo/web
fi
chmod -R 777 .expo 2>/dev/null || true
echo "=== .expo/web setup complete ==="
ls -la .expo/
