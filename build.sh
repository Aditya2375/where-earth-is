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
# USGS/PDS public-domain equirectangular browse mosaics. Never fetch the 170 MB/12 GB originals at build.
dl venus.jpg https://astrogeology.usgs.gov/ckan/dataset/bf10c4f9-7587-4357-b0d9-81d5b6e6637c/resource/12345d86-e2a3-45eb-af88-c1e8bf3ac358/download/full.jpg
dl mars.jpg https://astrogeology.usgs.gov/ckan/dataset/7131d503-cdc9-45a5-8f83-5126c0fd397e/resource/6afad901-1caa-48a7-8b62-3911da0004c2/download/mars_viking_mdim21_clrmosaic_global_1024.jpg
# Real galaxies: 2MASS Redshift Survey (Huchra et al. 2012), VizieR J/ApJS/199/26. RA, Dec, cz, K mag.
mkdir -p public/data
curl -fsSL --retry 2 --max-time 100 "https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=J/ApJS/199/26/table3&-out=ID,RAJ2000,DEJ2000,cz,Kcmag&-out.max=50000&-out.meta=." -o /tmp/2mrs.tsv && awk -F'\t' '!/^#/ && NF>=5 && $4+0>0 {printf "%s,%s,%d,%s\n",$2+0,$3+0,$4+0,$5+0}' /tmp/2mrs.tsv > public/data/2mrs.csv || echo "2mrs not fetched"
# Real stars: Hipparcos catalogue (ESA 1997), VizieR I/239/hip_main, V < 9.5. RA, Dec, V mag, B-V.
curl -fsSL --retry 2 --max-time 100 "https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=I/239/hip_main&-out=RAICRS,DEICRS,Vmag,B-V&-out.max=200000&-out.meta=.&Vmag=%3C9.5" -o /tmp/hip.tsv && awk -F'\t' '!/^#/ && NF>=4 && $1 ~ /[0-9]/ {printf "%.3f,%.3f,%.2f,%s\n",$1+0,$2+0,$3+0,($4+0==0&&$4!~/0/)?"":$4+0}' /tmp/hip.tsv > public/data/hip.csv || echo "hip not fetched"
# Deep-sky objects: OpenNGC (Verga, CC-BY-SA 4.0). Name,Type,RA deg,Dec deg,V mag,Messier id. Galaxies, clusters, nebulae only.
curl -fsSL --retry 2 --max-time 60 https://raw.githubusercontent.com/mattiaverga/OpenNGC/master/database_files/NGC.csv -o /tmp/ngc.csv && awk -F';' 'NR>1 && $3!="" && $4!="" && ($2=="G"||$2=="OCl"||$2=="GCl"||$2=="PN"||$2=="Neb"||$2=="HII"||$2=="Cl+N"||$2=="GPair"||$2=="SNR") {split($3,a,":");split($4,d,":");ra=(a[1]+a[2]/60+a[3]/3600)*15;dd=(substr($4,1,1)=="-")?-(-d[1]+d[2]/60+d[3]/3600):(d[1]+d[2]/60+d[3]/3600);m=($24!="")?"M" ($24+0):"";printf "%s,%s,%.3f,%.3f,%s,%s\n",$1,$2,ra,dd,$10,m}' /tmp/ngc.csv > public/data/ngc.csv || echo "ngc not fetched"
# Exoplanet host stars: NASA Exoplanet Archive (TAP, pscomppars). Host, RA, Dec, V mag, planet count.
curl -fsSL --retry 2 --max-time 60 "https://exoplanetarchive.ipac.caltech.edu/TAP/sync?query=select+hostname,ra,dec,sy_vmag,count(pl_name)+as+n+from+pscomppars+group+by+hostname,ra,dec,sy_vmag&format=csv" | tail -n +2 | tr -d '"' > public/data/exo.csv || echo "exo not fetched"
# Quasars: SDSS DR16Q (Lyke et al. 2020), VizieR VII/289. Every 10th row. RA, Dec, z.
curl -fsSL --retry 2 --max-time 110 "https://vizier.cds.unistra.fr/viz-bin/asu-tsv?-source=VII/289/dr16q&-out=RAJ2000,DEJ2000,z&-out.max=1000000&-out.meta=." -o /tmp/qso.tsv && awk -F'\t' '!/^#/ && $1 ~ /[0-9]/ {n++; if(n%10==0) printf "%.2f,%.2f,%.2f\n",$1+0,$2+0,$3+0}' /tmp/qso.tsv > public/data/qso.csv || echo "qso not fetched"
ls -R public | head -60
