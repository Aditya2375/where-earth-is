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
dl mercury.jpg https://images-assets.nasa.gov/image/PIA17386/PIA17386~orig.jpg
dl jupiter.jpg https://images-assets.nasa.gov/image/PIA07782/PIA07782~orig.jpg
# Real galaxies: 2MASS Redshift Survey (Huchra et al. 2012), VizieR J/ApJS/199/26. RA, Dec, cz, K mag.
mkdir -p public/data
curl -fsSL --retry 2 --max-time 100 "https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=J/ApJS/199/26/table3&-out=ID,RAJ2000,DEJ2000,cz,Kcmag&-out.max=50000&-out.meta=." -o /tmp/2mrs.tsv && awk -F'\t' '!/^#/ && NF>=5 && $4+0>0 {printf "%s,%s,%d,%s\n",$2+0,$3+0,$4+0,$5+0}' /tmp/2mrs.tsv > public/data/2mrs.csv || echo "2mrs not fetched"
# Real stars: Hipparcos catalogue (ESA 1997), VizieR I/239/hip_main, V < 9.5. RA, Dec, V mag, B-V.
curl -fsSL --retry 2 --max-time 100 "https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=I/239/hip_main&-out=RAICRS,DEICRS,Vmag,B-V&-out.max=200000&-out.meta=.&Vmag=%3C9.5" -o /tmp/hip.tsv && awk -F'\t' '!/^#/ && NF>=4 && $1 ~ /[0-9]/ {printf "%.3f,%.3f,%.2f,%s\n",$1+0,$2+0,$3+0,($4+0==0&&$4!~/0/)?"":$4+0}' /tmp/hip.tsv > public/data/hip.csv || echo "hip not fetched"
ls -R public | head -60
