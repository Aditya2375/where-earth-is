set -e
rm -rf public
mkdir -p public
for f in [0-9]*-*; do
  case "$f" in *api~*|*vercel.json) continue;; esac
  n=$(echo "$f" | sed 's/^[0-9]*-//; s/~/\//g')
  mkdir -p "public/$(dirname "$n")"
  cp "$f" "public/$n"
done
ls -R public | head -40
