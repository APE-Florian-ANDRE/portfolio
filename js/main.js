// La mise en scène : le défilement fait courir, la caméra suit, les panneaux attendent dans le décor.
// Les panneaux restent du vrai HTML derrière le canvas : chacun y découpe une fenêtre transparente,
// testée en profondeur. Un arbre passé devant masque donc réellement le texte, sans perdre les liens.
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from '../vendor/CSS3DRenderer.js';
import { creerSentier, creerMonde, creerParticules, lisse } from './world.js';
import { creerCoureur } from './runner.js';
import { creerMeteo } from './meteo.js';

const params = new URLSearchParams(location.search);
const sansMouvement = matchMedia('(prefers-reduced-motion: reduce)').matches;
const essai = document.createElement('canvas').getContext('webgl2');

if (essai && !sansMouvement && !params.has('plat')) lancer();

function lancer() {
  document.documentElement.classList.add('monde');
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  const qualite = { mobile, ombres: !mobile };

  const hote = document.getElementById('monde');
  const sections = [...document.querySelectorAll('.panneau')];
  const sentier = creerSentier();
  let distance = 0;
  const L = sentier.longueur;

  // Les étapes sont posées juste après les virages du tracé.
  const positions = [22, 112, 232, 322, 412, 502, 592, L - 44];
  const TRAVERSEE = 3.6, ACCELERATION = 30; // secondes à pleine allure entre deux panneaux, m/s²
  const SEUIL_GESTE = 80, FIN_GESTE = 200; // pixels de défilement pour changer d'étape, ms de pause
  const ENTRE_CRANS = 600; // ms minimum entre deux crans dans le même sens
  const VISEE = 0.46; // part du regard accordée au panneau sur grand écran
  const CAM_RECUL = 4.6, CAM_HAUT = 1.7, DEVANT = 2.2, RECUL_PANNEAU = CAM_RECUL + DEVANT;
  const camBase = (d, c = new THREE.Vector3()) => sentier.point(d - CAM_RECUL, c).setY(c.y + CAM_HAUT);

  const etapes = sections.map((el, i) => {
    const d = positions[i];
    const cam = camBase(d);
    const sol = sentier.point(d + DEVANT);
    const avant = sentier.tangente(d + 2);
    const droite = new THREE.Vector3(-avant.z, 0, avant.x);
    const cote = sentier.tangente(d + 16).dot(droite) >= 0 ? 1 : -1;
    const a = 0.55;
    const lateral = cam.clone()
      .addScaledVector(avant, Math.cos(a) * RECUL_PANNEAU)
      .addScaledVector(droite, Math.sin(a) * RECUL_PANNEAU * cote);
    return { el, d, cam, sol, avant, droite, cote, lateral };
  });

  const zones = { plats: [], interdits: [], caches: [] };
  etapes.forEach((e, i) => {
    const y = e.sol.y;
    zones.plats.push({ x: e.lateral.x, z: e.lateral.z, r: 3.5, y });
    zones.interdits.push(
      { ax: e.cam.x, az: e.cam.z, bx: e.lateral.x, bz: e.lateral.z, r: 3.2 },
      { ax: e.cam.x, az: e.cam.z, bx: e.sol.x, bz: e.sol.z, r: 3 },
    );
    // De loin, le panneau se trouve derrière ce rideau ; un buisson passe aussi tout près de l'objectif.
    const loin = camBase(e.d - 20);
    for (const k of [0.5, 0.62, 0.74, 0.86]) {
      const p = loin.clone().lerp(e.lateral, k);
      zones.caches.push({ x: p.x + e.droite.x * e.cote * 1.8, z: p.z + e.droite.z * e.cote * 1.8, large: true });
    }
    for (const recul of [11, 8]) {
      const p = sentier.point(e.d - recul), t = sentier.tangente(e.d - recul);
      zones.caches.push({ x: p.x - t.z * e.cote * 2.4, z: p.z + t.x * e.cote * 2.4, large: false });
    }
    // Le rideau au ras du panneau : c'est lui qui crée la surprise au détour du virage.
    // Pas au départ, où le visiteur doit voir le panneau tout de suite.
    if (i === 0) return;
    // Il reste derrière la caméra une fois à l'arrêt : le texte est alors entièrement dégagé.
    for (const recul of [15, 12, 9]) {
      const p = sentier.point(e.d - recul), t = sentier.tangente(e.d - recul);
      zones.caches.push({ x: p.x - t.z * e.cote * 4, z: p.z + t.x * e.cote * 4.4, rideau: true });
    }
    const p = sentier.point(e.d - 11), t = sentier.tangente(e.d - 11);
    zones.caches.push({ x: p.x - t.z * e.cote * 9, z: p.z + t.x * e.cote * 9, rideau: true, arbre: true });
  });

  distance = etapes[0].d;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 1800);
  const monde = creerMonde(scene, sentier, zones, qualite);
  const particules = creerParticules(scene, qualite);
  const meteo = creerMeteo(scene, qualite, document.getElementById('meteo'), document.getElementById('modes'), params.get('meteo'), params.has('heure') ? Number(params.get('heure')) : NaN);
  const coureur = creerCoureur();
  scene.add(coureur.racine);

  const rendu = new THREE.WebGLRenderer({ antialias: !mobile, alpha: true, powerPreference: 'high-performance' });
  rendu.shadowMap.enabled = qualite.ombres;
  rendu.shadowMap.type = THREE.PCFSoftShadowMap;
  rendu.setClearColor(0x000000, 0);
  rendu.toneMapping = THREE.ACESFilmicToneMapping;
  rendu.toneMappingExposure = 1;
  let densite = Math.min(devicePixelRatio, mobile ? 1.5 : 2);
  rendu.setPixelRatio(densite);

  const couche = new CSS3DRenderer();
  couche.domElement.style.position = 'absolute';
  couche.domElement.style.left = couche.domElement.style.top = 0;
  const sentierDom = document.getElementById('sentier');
  hote.prepend(couche.domElement);
  couche.domElement.append(sentierDom);
  hote.append(rendu.domElement);

  // Chaque panneau : la fenêtre percée dans le canvas, le cadre et les poteaux en bois.
  const bois = new THREE.MeshStandardMaterial({ color: '#4d3b2c', roughness: 0.95 });
  const cadreGeo = new THREE.BoxGeometry(1, 1, 1);
  const posteGeo = new THREE.CylinderGeometry(0.055, 0.07, 1, 10);
  const fenetreGeo = new THREE.PlaneGeometry(1, 1);

  for (const e of etapes) {
    e.objet = new CSS3DObject(e.el);
    e.fenetre = new THREE.Mesh(fenetreGeo, new THREE.ShaderMaterial({
      blending: THREE.NoBlending, fog: false, toneMapped: false,
      uniforms: { uBrume: { value: new THREE.Color() }, uAlpha: { value: 0 } },
      vertexShader: 'void main(){ gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }',
      fragmentShader: 'uniform vec3 uBrume; uniform float uAlpha; void main(){ gl_FragColor = vec4(uBrume * uAlpha, uAlpha); }',
    }));
    e.cadre = new THREE.Mesh(cadreGeo, bois);
    e.posteG = new THREE.Mesh(posteGeo, bois);
    e.posteD = new THREE.Mesh(posteGeo, bois);
    for (const m of [e.cadre, e.posteG, e.posteD]) m.castShadow = qualite.ombres;
    scene.add(e.objet, e.fenetre, e.cadre, e.posteG, e.posteD);
  }

  let largeur = 1, hauteur = 1;
  const vue = new THREE.Vector3(), axeX = new THREE.Vector3();

  function disposer() {
    largeur = hote.clientWidth;
    hauteur = hote.clientHeight;
    camera.aspect = largeur / hauteur;
    camera.updateProjectionMatrix();
    rendu.setSize(largeur, hauteur, false);
    couche.setSize(largeur, hauteur);

    const portrait = largeur / hauteur < 1.45;
    const metresParPixel = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * RECUL_PANNEAU / hauteur;
    const reserveTableau = 84;

    for (const e of etapes) {
      const w = e.el.offsetWidth, h = e.el.offsetHeight;
      const place = hauteur - reserveTableau - 32;
      const reduction = Math.min(1, place / h, (largeur - 24) / w);
      const s = metresParPixel * reduction;
      const lw = w * s, lh = h * s;
      const auDessus = portrait;

      const centre = new THREE.Vector3();
      if (auDessus) {
        // Le panneau enjambe le sentier : le coureur passe dessous.
        sentier.point(e.d + DEVANT, centre);
        centre.y += 2.45 + lh / 2;
        e.ox = 0;
        e.oy = hauteur / 2 - (h * reduction) / 2 - 18;
      } else {
        centre.copy(e.lateral);
        centre.y = e.sol.y + 0.65 + lh / 2;
        e.ox = 0;
        // La caméra reste à l'horizontale : dans une montée, on décale l'image pour garder le haut du panneau.
        const hautPanneau = (centre.y + lh / 2 - e.cam.y) / metresParPixel;
        // Dans une descente, c'est le coureur qui glisserait sous le tableau de bord : on remonte l'image.
        const piedsCoureur = (e.cam.y - sentier.point(e.d).y) / (metresParPixel * CAM_RECUL / RECUL_PANNEAU);
        // La marge couvre aussi la perspective : un panneau un peu plus proche paraît plus grand que prévu.
        const marge = hauteur / 2 - 46 - hautPanneau;
        e.oy = marge < 0 ? marge : Math.max(0, Math.min(piedsCoureur - (hauteur / 2 - 150), marge));
      }
      e.centre = centre;

      // Le panneau reste parallèle à l'image, pour qu'il ne paraisse jamais de travers à l'arrêt.
      const vise = sentier.point(e.d + 8).setY(0).lerp(centre.clone().setY(0), portrait ? 1 : VISEE);
      const face = centre.clone().add(e.cam.clone().setY(0).sub(vise).setY(0));
      e.objet.position.copy(centre);
      e.objet.scale.setScalar(s);
      e.objet.lookAt(face);
      e.fenetre.position.copy(centre);
      e.fenetre.quaternion.copy(e.objet.quaternion);
      e.fenetre.scale.set(lw, lh, 1);

      axeX.set(1, 0, 0).applyQuaternion(e.objet.quaternion);
      vue.set(0, 0, 1).applyQuaternion(e.objet.quaternion);
      e.vue = vue.clone();
      e.cadre.position.copy(centre).addScaledVector(vue, -0.05);
      e.cadre.quaternion.copy(e.objet.quaternion);
      e.cadre.scale.set(lw + 0.08, lh + 0.08, 0.08);

      const sol = auDessus ? sentier.point(e.d + DEVANT).y : e.sol.y;
      const hautPoste = centre.y + lh * 0.2;
      for (const [poste, c] of [[e.posteG, -1], [e.posteD, 1]]) {
        poste.position.copy(centre).addScaledVector(axeX, c * (lw / 2 - lw * 0.06)).addScaledVector(vue, -0.13);
        poste.position.y = (sol + hautPoste) / 2;
        poste.scale.set(1, hautPoste - sol + 0.3, 1);
      }
    }
  }

  // La visite avance par étapes : le coureur fait tout le trajet d'un panneau à l'autre.
  const n = etapes.length;
  let courante = 0, plafond = 0, pause = false, sonde = null, chronoArrivee = 0;
  const FIN_ARRIVEE = 2.075;
  const allerA = i => {
    courante = THREE.MathUtils.clamp(i, 0, n - 1);
    plafond = Math.max(10, Math.abs(etapes[courante].d - distance) / TRAVERSEE);
  };

  // Tableau de bord : le profil de la course, avec un repère cliquable par étape.
  document.getElementById('tableau').hidden = false;
  const elKm = document.getElementById('km'), elAlti = document.getElementById('alti');
  const elPoint = document.getElementById('profil-point'), elFait = document.getElementById('profil-fait');
  const profil = document.getElementById('profil');
  const altMax = sentier.point(L).y;
  const debut = etapes[0].d, arrivee = etapes[n - 1].d;
  const px = d => (d - debut) / (arrivee - debut) * 1000;
  const py = d => 58 - sentier.point(d).y / altMax * 50;
  let trace = 'M0 60';
  for (let i = 0; i <= 120; i++) { const d = debut + (arrivee - debut) * i / 120; trace += ` L${px(d).toFixed(1)} ${py(d).toFixed(1)}`; }
  document.getElementById('profil-fond').setAttribute('d', `${trace} L1000 60 Z`);
  etapes.forEach((e, i) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'etape';
    b.style.left = `${px(e.d) / 10}%`;
    b.title = e.el.querySelector('h1, h2').textContent;
    b.setAttribute('aria-label', `Aller à : ${b.title}`);
    b.addEventListener('click', () => allerA(i));
    profil.append(b);
  });
  // Un lien atteint au clavier amène le coureur jusqu'à son panneau.
  etapes.forEach((e, i) => e.el.addEventListener('focusin', () => {
    couche.domElement.scrollTop = couche.domElement.scrollLeft = 0;
    allerA(i);
  }));

  const son = creerSon(document.getElementById('son'));

  addEventListener('resize', disposer);
  brancherCommandes();
  let precedent = performance.now(), vitesse = 0, duree = 0, sens = 1;
  let cumul = 0, images = 0;

  const foyer = new THREE.Vector3(), regard = new THREE.Vector3(), cible = new THREE.Vector3();
  const pos = new THREE.Vector3(), tan = new THREE.Vector3(), derriere = new THREE.Vector3();

  function brancherCommandes() {
    // Un geste ne vaut qu'un seul cran : l'inertie d'un trackpad, qui prolonge le même geste, est ignorée.
    // Un geste en sens inverse compte tout de suite, et une pause clôt le geste en cours.
    let cumul = 0, dernier = 0, consomme = 0, dernierCran = -Infinity, sensCran = 0;
    addEventListener('wheel', ev => {
      ev.preventDefault();
      const delta = ev.deltaY * (ev.deltaMode === 1 ? 40 : ev.deltaMode === 2 ? innerHeight : 1);
      if (ev.timeStamp - dernier > FIN_GESTE) cumul = consomme = 0;
      dernier = ev.timeStamp;
      const sensGeste = Math.sign(delta);
      if (sensGeste === consomme) return;
      if (sensGeste !== Math.sign(cumul)) cumul = 0;
      cumul += delta;
      if (Math.abs(cumul) < SEUIL_GESTE) return;
      cumul = 0;
      consomme = sensGeste;
      // Une machine chargée peut espacer l'inertie au point de faire croire à un nouveau geste.
      if (sensGeste === sensCran && ev.timeStamp - dernierCran < ENTRE_CRANS) return;
      dernierCran = ev.timeStamp;
      sensCran = sensGeste;
      allerA(courante + sensGeste);
    }, { passive: false });

    let departY = null;
    addEventListener('touchstart', ev => { departY = ev.touches[0].clientY; }, { passive: true });
    addEventListener('touchend', ev => {
      if (departY === null) return;
      const glisse = departY - ev.changedTouches[0].clientY;
      departY = null;
      if (Math.abs(glisse) >= SEUIL_GESTE * 0.6) allerA(courante + Math.sign(glisse));
    }, { passive: true });

    addEventListener('keydown', ev => {
      if (ev.altKey || ev.ctrlKey || ev.metaKey) return;
      const surCommande = ev.target.closest?.('a, button');
      const action = {
        ArrowDown: 1, ArrowRight: 1, PageDown: 1, ArrowUp: -1, ArrowLeft: -1, PageUp: -1,
        ' ': surCommande ? 0 : ev.shiftKey ? -1 : 1,
      }[ev.key];
      if (ev.key === 'Home') allerA(0);
      else if (ev.key === 'End') allerA(n - 1);
      else if (action) allerA(courante + action);
      else return;
      ev.preventDefault();
    });
  }

  function tracePartiel(d) {
    let t = 'M0 60';
    const pasD = (arrivee - debut) / 120;
    for (let x = debut; x < d; x += pasD) t += ` L${px(x).toFixed(1)} ${py(x).toFixed(1)}`;
    return `${t} L${px(d).toFixed(1)} ${py(d).toFixed(1)} L${px(d).toFixed(1)} 60 Z`;
  }

  function image(maintenant) {
    const dt = Math.min(0.05, (maintenant - precedent) / 1000);
    precedent = maintenant;
    duree += dt;

    // Une vraie course : il accélère, tient son allure, puis freine en arrivant au panneau.
    // S'il doit repartir dans l'autre sens, il freine trois fois plus fort.
    const ecart = pause ? 0 : etapes[courante].d - distance;
    const voulue = Math.sign(ecart) * Math.min(Math.sqrt(2 * ACCELERATION * Math.abs(ecart)), Math.abs(ecart) * 3, plafond);
    const reprise = (voulue * vitesse < 0 ? ACCELERATION * 3 : ACCELERATION) * dt;
    if (pause) vitesse = 0;
    vitesse += THREE.MathUtils.clamp(voulue - vitesse, -reprise, reprise);
    distance += vitesse * dt;
    if (Math.abs(vitesse) > 0.5) sens = Math.sign(vitesse);

    sentier.point(distance, foyer);
    sentier.tangente(distance, tan);
    coureur.racine.position.copy(foyer);
    // À l'arrivée : il s'arrête, souffle, se retourne vers nous, puis lève les bras. Au départ, l'inverse, en accéléré.
    const arrive = courante === n - 1 && Math.abs(arrivee - distance) < 0.6 && Math.abs(vitesse) < 2;
    chronoArrivee = arrive ? Math.min(FIN_ARRIVEE, chronoArrivee + dt) : Math.max(0, chronoArrivee - dt * 4);
    const retournement = lisse(chronoArrivee, 0.175, 1.175);
    const victoire = lisse(chronoArrivee, 1.275, 2.075);
    coureur.orienter(dt, Math.atan2(tan.x * sens, tan.z * sens) + retournement * Math.PI);

    // La caméra quitte le chemin devant elle pour regarder le panneau le plus proche.
    let poids = 0, proche = etapes[0];
    etapes.forEach((e, i) => {
      const entree = i === 0 ? 1 : lisse(distance, e.d - 15, e.d - 5);
      const sortie = i === n - 1 ? 0 : lisse(distance, e.d + 5, e.d + 11);
      const w = entree * (1 - sortie);
      if (w > poids) { poids = w; proche = e; }
    });
    camBase(distance, pos);
    sentier.point(distance + 8, regard).setY(regard.y + 1.15);
    // Sur grand écran le coureur reste le sujet : la caméra ne fait qu'entrouvrir le regard vers le panneau.
    cible.copy(regard).lerp(proche.centre, poids * (largeur / hauteur < 1.45 ? 1 : VISEE));
    const pas = lisse(Math.abs(vitesse), 0.2, 4);
    pos.y += 0.016 * pas * Math.sin(distance / 3.1 * Math.PI * 4);
    pos.x += 0.012 * pas * Math.sin(distance / 3.1 * Math.PI * 2);
    // Devant un panneau, le regard revient à l'horizontale : le texte reste droit, même dans une pente.
    if (largeur / hauteur >= 1.45) cible.y += (pos.y - cible.y) * poids;
    camera.position.copy(pos);
    camera.lookAt(cible);
    if (sonde) { camera.position.set(foyer.x + sonde.x, foyer.y + sonde.y, foyer.z + sonde.z); camera.lookAt(foyer.x, foyer.y + 1.55, foyer.z); }

    const ox = sonde ? 0 : proche.ox * poids, oy = sonde ? 0 : proche.oy * poids;
    camera.setViewOffset(largeur, hauteur, ox, oy, largeur, hauteur);

    const angleRegard = poids > 0.4 ? proche.cote * -0.55 * poids * (1 - retournement) : 0;
    const appui = coureur.animer(dt, duree, distance, vitesse, victoire, angleRegard, 4 * retournement * (1 - retournement));
    if (appui) {
      particules.appui(foyer);
      son.pas(Math.abs(vitesse));
    }

    const avancement = THREE.MathUtils.clamp((distance - debut) / (arrivee - debut), 0, 1);
    meteo.mettreAJour(dt, camera);
    monde.mettreAJour(dt, foyer, camera, meteo.etat);
    coureur.eclairer(meteo.etat.nuit, camera);
    particules.mettreAJour(dt, camera, duree);

    // Un panneau baigne dans la même brume que la forêt, et disparaît une fois dépassé.
    for (const e of etapes) {
      const ecart = e.centre.distanceTo(camera.position);
      const devant = derriere.copy(camera.position).sub(e.centre).dot(e.vue) > 0.4;
      const visible = devant && ecart > 1.2 && ecart < 170;
      // L'élément HTML reste affiché, sinon ses liens ne pourraient plus prendre le focus au clavier :
      // sans fenêtre percée, le canvas opaque le recouvre déjà.
      e.fenetre.visible = visible;
      if (!visible) continue;
      const f = 1 - Math.exp(-((scene.fog.density * ecart) ** 2));
      // Un léger voile, même de près : la planche prend la lumière de l'air qui l'entoure.
      e.fenetre.material.uniforms.uAlpha.value = Math.max(0.1 + meteo.etat.nuit * 0.26, f);
      e.fenetre.material.uniforms.uBrume.value.copy(scene.fog.color).convertLinearToSRGB();
      e.el.style.pointerEvents = poids > 0.5 && e === proche ? 'auto' : 'none';
    }

    // Si la machine peine, on sacrifie la finesse de l'image plutôt que la fluidité.
    // À faire avant le rendu : redimensionner vide le canvas.
    cumul += dt; images++;
    if (cumul > 1.5) {
      if (images / cumul < 38 && densite > 0.8) {
        densite = Math.max(0.8, densite - 0.25);
        rendu.setPixelRatio(densite);
        rendu.setSize(largeur, hauteur, false);
      }
      cumul = 0; images = 0;
    }

    rendu.render(scene, camera);
    couche.render(scene, camera);

    elKm.textContent = `${(avancement * 21.1).toFixed(1).replace('.', ',')} km`;
    elAlti.textContent = `${Math.round(320 + foyer.y * 14)} m`;
    elPoint.style.left = `${avancement * 100}%`;
    elPoint.style.bottom = `${(60 - py(distance)) / 60 * 100}%`;
    elFait.setAttribute('d', tracePartiel(distance));
    son.ambiance(avancement, meteo.etat);

    requestAnimationFrame(image);
  }

  (document.fonts?.ready ?? Promise.resolve()).then(() => {
    disposer();
    if (params.has('debug')) window.__sentier = { chrono: () => chronoArrivee, sonde: v => { sonde = v; }, poser: d => { pause = true; distance = d; }, sentier, meteo: meteo.etat, etapes, camera, scene, allerA, camBase, rendu, etape: () => courante, saut: () => { distance = etapes[courante].d; vitesse = 0; } };
    requestAnimationFrame(t => { precedent = t; image(t); });
  });
}

// Des sons synthétisés : le site n'a aucun fichier audio à charger. Muet tant qu'on ne l'active pas.
function creerSon(bouton) {
  let ctx = null, sortie = null, souffle = null, gainVent = null, actif = false, oiseau = 0;
  const brut = () => {
    const b = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate), d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return b;
  };
  function demarrer() {
    ctx = new AudioContext();
    sortie = ctx.createGain();
    sortie.gain.value = 0.55;
    sortie.connect(ctx.destination);
    const vent = ctx.createBufferSource();
    vent.buffer = brut(); vent.loop = true;
    souffle = ctx.createBiquadFilter();
    souffle.type = 'bandpass'; souffle.frequency.value = 420; souffle.Q.value = 0.5;
    gainVent = ctx.createGain();
    gainVent.gain.value = 0.05;
    vent.connect(souffle).connect(gainVent).connect(sortie);
    vent.start();
  }
  bouton.addEventListener('click', () => {
    actif = !actif;
    if (actif && !ctx) demarrer();
    if (ctx) actif ? ctx.resume() : ctx.suspend();
    bouton.setAttribute('aria-pressed', actif);
    bouton.textContent = actif ? 'Son activé' : 'Son coupé';
  });
  return {
    pas(allure) {
      if (!actif) return;
      const t = ctx.currentTime;
      const s = ctx.createBufferSource();
      s.buffer = brut();
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 900 + Math.random() * 500;
      const g = ctx.createGain();
      g.gain.setValueAtTime(Math.min(0.28, 0.1 + allure * 0.012), t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.09);
      s.connect(f).connect(g).connect(sortie);
      s.start(t, Math.random()); s.stop(t + 0.1);
    },
    ambiance(u, temps) {
      if (!actif) return;
      // La crête est plus venteuse, la forêt plus habitée.
      souffle.frequency.value = 340 + u * 480 + temps.pluie * 1500;
      gainVent.gain.value = 0.05 + temps.pluie * 0.1 + temps.vent * 0.01;
      const t = ctx.currentTime;
      if (t < oiseau) return;
      oiseau = t + 1.5 + Math.random() * 5;
      if (u > 0.75 || temps.pluie > 0.2 || temps.nuit > 0.5) return;
      const o = ctx.createOscillator(), g = ctx.createGain();
      const f = 2300 + Math.random() * 1900;
      o.frequency.setValueAtTime(f, t);
      o.frequency.exponentialRampToValueAtTime(f * 1.3, t + 0.09);
      o.frequency.exponentialRampToValueAtTime(f * 0.86, t + 0.17);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(0.022, t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(g).connect(sortie);
      o.start(t); o.stop(t + 0.22);
    },
  };
}
