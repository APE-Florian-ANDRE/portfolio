// La météo : le temps qu'il fait réellement chez le visiteur s'invite sur le sentier.
// Rien n'est demandé à l'ouverture : le fuseau horaire donne une grande ville proche.
// Un clic sur l'étiquette utilise la position exacte, avec l'accord du navigateur.
// ?meteo=clair|nuageux|couvert|brouillard|bruine|pluie|neige|orage force un temps, pour le voir sans l'attendre.
// L'heure aussi est réelle : le soleil est calculé pour ce lieu et cet instant. ?heure=22.5 force une heure.
import * as THREE from 'three';

const PROFILS = {
  clair: {},
  nuageux: { nuages: 0.55 },
  couvert: { nuages: 1 },
  brouillard: { nuages: 0.85, brouillard: 1 },
  bruine: { nuages: 0.95, pluie: 0.3, mouille: 0.7 },
  pluie: { nuages: 1, pluie: 0.8, mouille: 1, vent: 1.8 },
  neige: { nuages: 0.9, neige: 1 },
  orage: { nuages: 1, pluie: 1, mouille: 1, orage: 1, vent: 3 },
};

const LIBELLES = {
  clair: 'Grand ciel', nuageux: 'Nuageux', couvert: 'Couvert', brouillard: 'Brouillard',
  bruine: 'Bruine', pluie: 'Pluie', neige: 'Neige', orage: 'Orage',
};

// Codes WMO utilisés par Open-Meteo.
function typeDeTemps(code) {
  if (code <= 1) return 'clair';
  if (code === 2) return 'nuageux';
  if (code === 3) return 'couvert';
  if (code === 45 || code === 48) return 'brouillard';
  if (code >= 51 && code <= 57) return 'bruine';
  if ((code >= 61 && code <= 67) || (code >= 80 && code <= 82)) return 'pluie';
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return 'neige';
  if (code >= 95) return 'orage';
  return 'clair';
}

const VILLES = {
  'Europe/Paris': ['Paris', 48.85, 2.35], 'Europe/Brussels': ['Bruxelles', 50.85, 4.35],
  'Europe/Zurich': ['Zurich', 47.37, 8.54], 'Europe/Luxembourg': ['Luxembourg', 49.61, 6.13],
  'Europe/Monaco': ['Monaco', 43.74, 7.42], 'Europe/London': ['Londres', 51.51, -0.13],
  'Europe/Dublin': ['Dublin', 53.35, -6.26], 'Europe/Madrid': ['Madrid', 40.42, -3.7],
  'Europe/Lisbon': ['Lisbonne', 38.72, -9.14], 'Europe/Rome': ['Rome', 41.9, 12.5],
  'Europe/Berlin': ['Berlin', 52.52, 13.4], 'Europe/Amsterdam': ['Amsterdam', 52.37, 4.9],
  'Europe/Vienna': ['Vienne', 48.21, 16.37], 'Europe/Stockholm': ['Stockholm', 59.33, 18.07],
  'Europe/Oslo': ['Oslo', 59.91, 10.75], 'Europe/Copenhagen': ['Copenhague', 55.68, 12.57],
  'Europe/Helsinki': ['Helsinki', 60.17, 24.94], 'Europe/Warsaw': ['Varsovie', 52.23, 21.01],
  'Europe/Athens': ['Athènes', 37.98, 23.73], 'Africa/Casablanca': ['Casablanca', 33.57, -7.59],
  'Africa/Algiers': ['Alger', 36.75, 3.06], 'Africa/Tunis': ['Tunis', 36.81, 10.18],
  'Africa/Dakar': ['Dakar', 14.72, -17.47], 'Africa/Abidjan': ['Abidjan', 5.35, -4],
  'America/New_York': ['New York', 40.71, -74.01], 'America/Chicago': ['Chicago', 41.88, -87.63],
  'America/Denver': ['Denver', 39.74, -104.99], 'America/Los_Angeles': ['Los Angeles', 34.05, -118.24],
  'America/Toronto': ['Toronto', 43.65, -79.38], 'America/Montreal': ['Montréal', 45.5, -73.57],
  'America/Martinique': ['Fort-de-France', 14.6, -61.07], 'America/Guadeloupe': ['Pointe-à-Pitre', 16.24, -61.53],
  'Indian/Reunion': ['Saint-Denis', -20.88, 55.45], 'Pacific/Noumea': ['Nouméa', -22.27, 166.46],
  'Asia/Tokyo': ['Tokyo', 35.68, 139.69], 'Asia/Dubai': ['Dubaï', 25.2, 55.27],
  'Australia/Sydney': ['Sydney', -33.87, 151.21],
};

// Le fuseau seul donne encore la longitude ; la latitude est alors celle de l'Europe moyenne.
const lieuParDefaut = () => VILLES[Intl.DateTimeFormat().resolvedOptions().timeZone]
  ?? [null, 46, -new Date().getTimezoneOffset() / 4];

// Élévation (degrés) et azimut (radians, 0 au sud, négatif vers l'est) du soleil, formules de l'Astronomical Almanac.
function positionSoleil(date, latitude, longitude) {
  const rad = Math.PI / 180;
  const j = date.getTime() / 86400000 - 10957.5; // jours depuis le 1er janvier 2000 à midi
  const g = (357.529 + 0.98560028 * j) * rad;
  const l = (280.459 + 0.98564736 * j + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * rad;
  const e = (23.439 - 0.00000036 * j) * rad;
  const declinaison = Math.asin(Math.sin(e) * Math.sin(l));
  const ascension = Math.atan2(Math.cos(e) * Math.sin(l), Math.cos(l));
  const h = (280.46061837 + 360.98564736629 * j + longitude) * rad - ascension;
  const f = latitude * rad;
  return {
    elevation: Math.asin(Math.sin(f) * Math.sin(declinaison) + Math.cos(f) * Math.cos(declinaison) * Math.cos(h)) / rad,
    azimut: Math.atan2(Math.sin(h), Math.cos(h) * Math.sin(f) - Math.tan(declinaison) * Math.cos(f)),
  };
}

async function lireMeteo(latitude, longitude) {
  const url = new URL('https://api.open-meteo.com/v1/forecast');
  url.search = new URLSearchParams({
    latitude: latitude.toFixed(2), longitude: longitude.toFixed(2),
    current: 'weather_code,temperature_2m,cloud_cover,wind_speed_10m',
  });
  const reponse = await fetch(url, { signal: AbortSignal.timeout(15000) });
  if (!reponse.ok) throw new Error(`Open-Meteo a répondu ${reponse.status}`);
  const { current } = await reponse.json();
  if (!Number.isFinite(current?.weather_code)) throw new Error('Réponse météo incomplète');
  return current;
}

function creerPrecipitations(scene, qualite) {
  const COTE = 44, HAUT = 26;
  const r = (function () { let s = 42; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296; })();

  const nPluie = qualite.mobile ? 700 : 1600;
  const base = new Float32Array(nPluie * 3);
  for (let i = 0; i < nPluie * 3; i += 3) base.set([r() * COTE, r() * HAUT, r() * COTE], i);
  const lignes = new Float32Array(nPluie * 6);
  const gPluie = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(lignes, 3));
  const pluie = new THREE.LineSegments(gPluie, new THREE.LineBasicMaterial({ color: '#dbe5ec', transparent: true, opacity: 0.6, depthWrite: false }));
  pluie.frustumCulled = false;
  scene.add(pluie);

  const nNeige = qualite.mobile ? 500 : 1200;
  const flocons = new Float32Array(nNeige * 3);
  for (let i = 0; i < nNeige * 3; i += 3) flocons.set([r() * COTE, r() * HAUT, r() * COTE], i);
  const affichage = new Float32Array(nNeige * 3);
  const gNeige = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(affichage, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d'), d = x.createRadialGradient(16, 16, 1, 16, 16, 16);
  d.addColorStop(0, 'rgba(255,255,255,1)'); d.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = d; x.fillRect(0, 0, 32, 32);
  const neige = new THREE.Points(gNeige, new THREE.PointsMaterial({ color: '#ffffff', size: 0.11, map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.9, depthWrite: false }));
  neige.frustumCulled = false;
  scene.add(neige);

  const replie = (v, centre, etendue) => ((v - centre + etendue / 2) % etendue + etendue) % etendue - etendue / 2 + centre;
  let chute = 0;

  return function mettreAJour(dt, camera, temps, etat) {
    chute += dt;
    const cx = camera.position.x, cy = camera.position.y + 6, cz = camera.position.z;
    const biais = 0.8 + etat.vent * 0.9;

    pluie.visible = etat.pluie > 0.01;
    if (pluie.visible) {
      pluie.material.opacity = 0.6 * Math.min(1, etat.pluie * 1.5);
      pluie.material.color.set('#dbe5ec').multiplyScalar(0.25 + etat.jour * 0.75);
      const actives = Math.floor(nPluie * etat.pluie);
      for (let i = 0; i < actives; i++) {
        const px = replie(base[i * 3] + biais * chute, cx, COTE);
        const py = replie(base[i * 3 + 1] - 20 * chute, cy, HAUT);
        const pz = replie(base[i * 3 + 2], cz, COTE);
        lignes.set([px, py, pz, px + biais * 0.03, py - 0.55, pz], i * 6);
      }
      gPluie.setDrawRange(0, actives * 2);
      gPluie.attributes.position.needsUpdate = true;
    }

    neige.visible = etat.neige > 0.01;
    if (neige.visible) {
      neige.material.color.setScalar(0.3 + etat.jour * 0.7);
      for (let i = 0; i < nNeige; i++) {
        const o = i * 0.37;
        affichage[i * 3] = replie(flocons[i * 3] + Math.sin(temps * 0.6 + o) * 0.8 + biais * 0.35 * chute, cx, COTE);
        affichage[i * 3 + 1] = replie(flocons[i * 3 + 1] - 1.5 * chute, cy, HAUT);
        affichage[i * 3 + 2] = replie(flocons[i * 3 + 2] + Math.cos(temps * 0.5 + o) * 0.8, cz, COTE);
      }
      gNeige.setDrawRange(0, Math.floor(nNeige * etat.neige));
      gNeige.attributes.position.needsUpdate = true;
    }
  };
}

// Un moment choisi garde une course du soleil crédible : la transition passe par le couchant.
const MOMENTS = { jour: { elevation: 40, azimut: 0.2 }, nuit: { elevation: -28, azimut: 1 } };
const TEMPS_NEUTRE = { nuages: 0, pluie: 0, neige: 0, brouillard: 0, mouille: 0, orage: 0, vent: 1 };

export function creerMeteo(scene, qualite, bouton, reglages, force, heure) {
  const etat = { ...TEMPS_NEUTRE, eclair: 0, elevation: 40, azimut: 0, jour: 1, nuit: 0 };
  const boutonsTemps = [...reglages.querySelectorAll('[data-temps]')];
  const boutonsMoment = [...reglages.querySelectorAll('[data-moment]')];
  let voulu = { ...TEMPS_NEUTRE };
  let lieuExact = null, prochainEclair = 4, temps = 0, attente = 0, essais = 3;
  let mode = force in PROFILS ? force : 'reel', moment = 'auto', releve = null, soleilVoulu = null;
  const precipitations = creerPrecipitations(scene, qualite);

  const presser = (liste, cle, valeur) => {
    for (const b of liste) b.setAttribute('aria-pressed', String(b.dataset[cle] === valeur));
  };

  function libelle(type) {
    return type === 'clair' && soleilVoulu.elevation < -3 ? 'Nuit claire' : LIBELLES[type];
  }

  function calculerSoleil() {
    if (moment !== 'auto') { soleilVoulu = MOMENTS[moment]; return; }
    const date = new Date();
    if (Number.isFinite(heure)) date.setHours(Math.floor(heure), (heure % 1) * 60, 0, 0);
    const [, latitude, longitude] = lieuExact ?? lieuParDefaut();
    soleilVoulu = positionSoleil(date, latitude, longitude);
  }

  function appliquer(type) {
    voulu = { ...TEMPS_NEUTRE, ...PROFILS[type] };
    bouton.textContent = libelle(type);
    bouton.hidden = false;
  }

  function appliquerReleve() {
    if (!releve) {
      voulu = { ...TEMPS_NEUTRE };
      bouton.hidden = true;
      return;
    }
    const { type, m, nom } = releve;
    appliquer(type);
    bouton.textContent = `${libelle(type)}, ${Math.round(m.temperature_2m)} °C ${nom}`;
    voulu.vent = Math.max(voulu.vent, 1 + m.wind_speed_10m / 25);
    if (type === 'clair' || type === 'nuageux') voulu.nuages = Math.max(voulu.nuages, m.cloud_cover / 140);
  }

  const afficherTemps = () => (mode === 'reel' ? appliquerReleve() : appliquer(mode));

  async function actualiser() {
    const lieu = lieuExact ?? VILLES[Intl.DateTimeFormat().resolvedOptions().timeZone];
    if (!lieu) return;
    const [ville, latitude, longitude] = lieu;
    try {
      const m = await lireMeteo(latitude, longitude);
      releve = { type: typeDeTemps(m.weather_code), m, nom: lieuExact ? ville : `à ${ville}` };
    } catch {
      // Le démarrage de la 3D peut bloquer la page assez longtemps pour faire échouer la lecture :
      // on réessaie. Sans météo, le sentier garde simplement son grand ciel.
      if (!releve && essais-- > 0) setTimeout(actualiser, 20000);
    }
    if (mode === 'reel') appliquerReleve();
  }

  function choisirMoment(valeur) {
    moment = valeur;
    presser(boutonsMoment, 'moment', moment);
    calculerSoleil();
    afficherTemps();
  }

  function choisirTemps(valeur) {
    mode = valeur;
    presser(boutonsTemps, 'temps', mode);
    // Demander le soleil en pleine nuit ne laisserait voir que les étoiles.
    if (mode === 'clair' && moment === 'auto' && soleilVoulu.elevation < 0) choisirMoment('jour');
    afficherTemps();
  }

  for (const b of boutonsTemps) b.addEventListener('click', () => choisirTemps(b.dataset.temps));
  for (const b of boutonsMoment) b.addEventListener('click', () => choisirMoment(b.dataset.moment));
  bouton.addEventListener('click', () => {
    navigator.geolocation?.getCurrentPosition(p => {
      lieuExact = ['chez toi', p.coords.latitude, p.coords.longitude];
      calculerSoleil();
      actualiser();
      if (mode !== 'reel') choisirTemps('reel');
    }, undefined, { maximumAge: 600000, timeout: 8000 });
  });

  calculerSoleil();
  etat.elevation = soleilVoulu.elevation;
  etat.azimut = soleilVoulu.azimut;
  presser(boutonsTemps, 'temps', mode);
  presser(boutonsMoment, 'moment', moment);
  if (mode !== 'reel') {
    appliquer(mode);
    Object.assign(etat, voulu);
  }
  actualiser();
  setInterval(actualiser, 15 * 60 * 1000);

  function mettreAJour(dt, camera) {
    temps += dt;
    attente -= dt;
    if (attente <= 0) {
      attente = 30;
      calculerSoleil();
    }
    const k = 1 - Math.exp(-dt * 0.9);
    for (const c of ['nuages', 'pluie', 'neige', 'brouillard', 'mouille', 'orage', 'vent']) etat[c] += (voulu[c] - etat[c]) * k;
    etat.elevation += (soleilVoulu.elevation - etat.elevation) * k;
    etat.azimut += Math.atan2(Math.sin(soleilVoulu.azimut - etat.azimut), Math.cos(soleilVoulu.azimut - etat.azimut)) * k;
    etat.jour = THREE.MathUtils.smoothstep(etat.elevation, -9, 3);
    etat.nuit = 1 - etat.jour;

    etat.eclair *= Math.exp(-dt * 7);
    if (etat.orage > 0.5 && temps > prochainEclair) {
      etat.eclair = 1;
      prochainEclair = temps + 5 + Math.random() * 11;
    }
    precipitations(dt, camera, temps, etat);
  }

  return { etat, mettreAJour };
}
