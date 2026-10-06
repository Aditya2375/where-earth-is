set -e
rm -rf public
mkdir -p public
for f in [0-9]*-*; do
  case "$f" in *api~*|*vercel.json) continue;; esac
  n=$(echo "$f" | sed 's/^[0-9]*-//; s/~/\//g')
  mkdir -p "public/$(dirname "$n")"
  cp "$f" "public/$n"
done
# Earth imagery: NASA Visible Earth (public domain) and three.js example maps (MIT). Fetched at build so the repo stays small.
mkdir -p public/tex
N=https://eoimages.gsfc.nasa.gov/images/imagerecords
T=https://raw.githubusercontent.com/mrdoob/three.js/dev/examples/textures/planets
dl() { curl -fsSL --retry 2 --max-time 50 -o "public/tex/$1" "$2" || echo "texture $1 not fetched"; }
dl day-hi.jpg $N/73000/73909/world.topo.bathy.200412.3x5400x2700.jpg
dl night-hi.jpg $N/79000/79765/dnb_land_ocean_ice.2012.3600x1800.jpg
dl cloud-hi.jpg $N/57000/57747/cloud_combined_2048.jpg
dl day-lo.jpg $T/earth_atmos_2048.jpg
dl night-lo.png $T/earth_lights_2048.png
dl spec.jpg $T/earth_specular_2048.jpg
ls -R public | head -60
