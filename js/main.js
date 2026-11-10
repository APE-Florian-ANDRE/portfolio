// La mise en scène : le défilement fait courir, la caméra suit, les panneaux attendent dans le décor.
// Les panneaux restent du vrai HTML derrière le canvas : chacun y découpe une fenêtre transparente,
// testée en profondeur. Un arbre passé devant masque donc réellement le texte, sans perdre les liens.
import * as THREE from 'three';
import { CSS3DRenderer, CSS3DObject } from '../vendor/CSS3DRenderer.js';
import { creerSentier, creerMonde, creerParticules, relief, lisse } from './world.js';
import { creerCoureur } from './runner.js';
import { creerMeteo } from './meteo.js';

const params = new URLSearchParams(location.search);
const sansMouvement = matchMedia('(prefers-reduced-motion: reduce)').matches;
const essai = document.createElement('canvas').getContext('webgl2');

// Sans le sentier, « Explorer le projet » ouvre directement la fiche ; le sentier en fait une variante à parcourir.
let explorer = fiche => fiche.showModal();
document.addEventListener('click', ev => {
  const bouton = ev.target.closest?.('.explorer');
  if (bouton) explorer(document.getElementById(bouton.dataset.vers));
});

// Le panneau Expériences se feuillette : une page par employeur, la plus récente d'abord.
for (const livre of document.querySelectorAll('.panneau-livre')) {
  const pages = [...livre.querySelectorAll('.page')];
  const folio = livre.querySelector('.folio');
  const [precedente, suivante] = livre.querySelectorAll('.tourner');
  let ouverte = 0;
  const afficher = () => {
    pages.forEach((page, i) => {
      page.inert = i !== ouverte;
      page.classList.toggle('ouverte', i === ouverte);
    });
    folio.textContent = `${ouverte + 1} / ${pages.length}`;
    precedente.disabled = ouverte === 0;
    suivante.disabled = ouverte === pages.length - 1;
  };
  livre.addEventListener('click', ev => {
    const bouton = ev.target.closest('.tourner');
    if (!bouton) return;
    const sens = Number(bouton.dataset.sens), vers = ouverte + sens;
    if (vers < 0 || vers >= pages.length) return;
    // La page qui tourne pivote autour de la reliure, par-dessus celle qu'elle découvre ou recouvre.
    const tourne = pages[sens > 0 ? ouverte : vers], dessous = pages[sens > 0 ? vers : ouverte];
    if (!sansMouvement) {
      const classe = sens > 0 ? 'tourne-avant' : 'tourne-arriere';
      for (const page of pages) page.classList.remove('tourne-avant', 'tourne-arriere', 'dessous');
      void tourne.offsetWidth;
      tourne.classList.add(classe);
      dessous.classList.add('dessous');
      tourne.addEventListener('animationend', () => tourne.classList.remove(classe) || dessous.classList.remove('dessous'), { once: true });
    }
    ouverte = vers;
    afficher();
  });
  afficher();
}

if (essai && !sansMouvement && !params.has('plat')) lancer();

function lancer() {
  document.documentElement.classList.add('monde');
  const mobile = matchMedia('(pointer: coarse)').matches || innerWidth < 700;
  const qualite = { mobile, ombres: !mobile };

  const hote = document.getElementById('monde');
  const sections = [...document.querySelectorAll('.panneau')];
  // Un panneau trop long se replie dans une enveloppe : Chrome ne transmet plus la souris
  // à un élément transformé en 3D qui rogne lui-même son contenu.
  for (const el of sections) {
    const contenu = document.createElement('div');
    contenu.className = 'contenu';
    // La barre pour tourner les pages reste en pied de panneau, sous la partie repliée.
    contenu.append(...[...el.childNodes].filter(n => !n.classList?.contains('feuilleter')));
    el.prepend(contenu);
    const suite = document.createElement('button');
    suite.type = 'button';
    suite.className = 'suite';
    suite.setAttribute('aria-expanded', 'false');
    suite.textContent = 'Voir la suite';
    contenu.after(suite);
  }
  const sentier = creerSentier();
  let distance = 0;
  const L = sentier.longueur;

  // Les étapes sont posées juste après les virages du tracé.
  const positions = [22, 68, 114, 150, 205, 312, 372, 432, 502, 592, L - 44];
  const TRAVERSEE = 3.6, ACCELERATION = 30; // secondes à pleine allure entre deux panneaux, m/s²
  const SEUIL_GESTE = 80, FIN_GESTE = 200; // pixels de défilement pour changer d'étape, ms de pause
  const ENTRE_CRANS = 600; // ms minimum entre deux crans dans le même sens
  const VISEE = 0.46; // part du regard accordée au panneau sur grand écran
  const CAM_RECUL = 4.6, CAM_HAUT = 1.7, DEVANT = 2.2, RECUL_PANNEAU = CAM_RECUL + DEVANT;
  const HAUT_MAX_PANNEAU = 620; // pixels : au-delà, le panneau se replie et « Voir la suite » le déplie
  const HAUT_MAX_LIVRE = 470, HAUT_MAX_COMPACT = 400; // le livre et « Dans le sac » se replient plus court
  // La planche cassée : un balancier amorti autour de sa charnière, et un clou qui la laisse pencher.
  const CHUTE = { depart: 1.45, raideur: 46, amorti: 5, raideurBiais: 34, amortiBiais: 5, secousse: 1.6, remontee: 14, echelle: 0.6 };
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

  // Chaque projet a sa variante, balisée en jaune : une trace qui quitte le sentier jusqu'à une clairière.
  // Parmi plusieurs tracés possibles, on garde celui qui épouse le mieux le terrain : ni tranchée, ni remblai.
  function creerVariante(e) {
    const depart = sentier.point(e.d), pivot = sentier.point(e.d + 6);
    let meilleure = null;
    for (const cote of [-e.cote, e.cote]) for (const angle of [0.6, 0.8, 1, 1.2, 1.4]) for (const virage of [-0.4, 0, 0.4]) {
      const droite = e.droite.clone().multiplyScalar(cote);
      const cap = a => e.avant.clone().multiplyScalar(Math.cos(a)).addScaledVector(droite, Math.sin(a));
      const p1 = pivot.clone().addScaledVector(droite, 1.2);
      const p2 = p1.clone().addScaledVector(cap(angle), 9);
      const p3 = p2.clone().addScaledVector(cap(angle + virage), 9);
      const p4 = p3.clone().addScaledVector(cap(angle + virage * 1.5), 7);
      const courbe = new THREE.CatmullRomCurve3([depart, p1, p2, p3, p4], false, 'centripetal');
      const longueur = courbe.getLength(), nb = Math.ceil(longueur), pas = longueur / nb;
      const points = courbe.getSpacedPoints(nb);
      // Elle s'éloigne du sentier principal à mesure qu'elle avance, évite les autres panneaux,
      // et sa clairière reste bien à l'écart.
      const degagee = points.every((p, k) => {
        const s = k * pas;
        if (s < 8) return true;
        const marge = s > longueur - 6 ? 12 : Math.min(8, (s - 6) * 0.5);
        return sentier.plusProche(p.x, p.z).distance > marge
          && etapes.every(o => Math.hypot(p.x - o.lateral.x, p.z - o.lateral.z) > 6);
      });
      if (!degagee) continue;

      // L'altitude suit le relief lissé mètre par mètre, sans dépasser 22 % de pente ;
      // au départ, elle reste collée au sentier qu'elle quitte.
      const brut = points.map(p => relief(sentier, p.x, p.z));
      points[0].y = depart.y;
      for (let k = 1; k <= nb; k++) {
        let somme = 0, compte = 0;
        for (let j = Math.max(0, k - 4); j <= Math.min(nb, k + 4); j++) { somme += brut[j]; compte++; }
        const voulu = THREE.MathUtils.lerp(sentier.plusProche(points[k].x, points[k].z).y, somme / compte, lisse(k * pas, 3, 9));
        points[k].y = THREE.MathUtils.clamp(voulu, points[k - 1].y - 0.22 * pas, points[k - 1].y + 0.22 * pas);
      }
      // Ce qu'il faudrait creuser ou remblayer de part et d'autre de la trace, et autour de la clairière.
      let creux = 0;
      for (let k = 6; k <= nb; k++) {
        const p = points[k], t = points[Math.min(nb, k + 1)].clone().sub(points[Math.max(0, k - 1)]).setY(0).normalize();
        for (const c of [-4, -2.5, 2.5, 4]) creux = Math.max(creux, Math.abs(relief(sentier, p.x - t.z * c, p.z + t.x * c) - p.y));
      }
      const fin = points[nb];
      for (let a = 0; a < 6.28; a += 0.5) for (const r of [6, 9]) {
        creux = Math.max(creux, Math.abs(relief(sentier, fin.x + Math.cos(a) * r, fin.z + Math.sin(a) * r) - fin.y) * 0.8);
      }
      // À relief égal, on préfère partir à l'opposé du panneau, à l'extérieur du virage.
      creux += cote === e.cote ? 0.3 : 0;
      if (!meilleure || creux < meilleure.creux) meilleure = { points, longueur, nb, creux };
    }
    if (!meilleure) return null;
    {
      const { points, longueur, nb, creux } = meilleure;

      const point = (s, c = new THREE.Vector3()) => {
        const f = THREE.MathUtils.clamp(s / longueur, 0, 1) * nb, i = Math.min(Math.floor(f), nb - 1);
        return c.copy(points[i]).lerp(points[i + 1], f - i);
      };
      const tangente = (s, c = new THREE.Vector3()) => c.copy(point(s + 1.5)).sub(point(s - 1.5)).setY(0).normalize();
      // En deçà du départ, la trace se confond avec le sentier ; au-delà de la clairière, elle file tout droit.
      const prolonge = (s, c = new THREE.Vector3()) => {
        if (s < 0) return sentier.point(e.d + s, c);
        if (s <= longueur) return point(s, c);
        return point(longueur, c).addScaledVector(tangente(longueur), s - longueur);
      };
      const proche = (x, z) => {
        let m = Infinity, y = 0;
        for (const p of points) {
          const e = (p.x - x) ** 2 + (p.z - z) ** 2;
          if (e < m) { m = e; y = p.y; }
        }
        return { distance: Math.sqrt(m), y };
      };
      return { longueur, point, tangente, prolonge, proche, fin: points[nb], creux };
    }
  }

  const variantes = [];
  etapes.forEach((e, i) => {
    const bouton = e.el.querySelector('.explorer');
    const v = bouton && creerVariante(e);
    if (!v) return;
    Object.assign(v, { etape: i, fiche: document.getElementById(bouton.dataset.vers), nom: e.el.querySelector('h2').textContent });
    e.variante = v;
    variantes.push(v);
  });

  const zones = { plats: [], interdits: [], caches: [], variantes };
  // Rien ne pousse sur la trace ni dans la clairière ; le monde se charge d'aplanir le sol.
  for (const v of variantes) {
    for (let s = 6; s <= v.longueur; s += 2.5) {
      const p = v.point(s), q = v.point(s - 2.5);
      zones.interdits.push({ ax: q.x, az: q.z, bx: p.x, bz: p.z, r: 2 });
    }
    zones.interdits.push({ ax: v.fin.x, az: v.fin.z, bx: v.fin.x, bz: v.fin.z, r: 7 });
  }
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

  // Un poteau indicateur à l'entrée de chaque variante, un autre dans sa clairière : flèche en bois, bout jaune.
  const jaune = new THREE.MeshStandardMaterial({ color: '#e0b63e', roughness: 0.7 });
  const poteauGeo = new THREE.CylinderGeometry(0.06, 0.075, 1.5, 8);
  const flecheGeo = new THREE.BoxGeometry(0.8, 0.17, 0.04), bandeGeo = new THREE.BoxGeometry(0.16, 0.18, 0.05);
  function poteau(pied, cap) {
    const g = new THREE.Group();
    const p = new THREE.Mesh(poteauGeo, bois), f = new THREE.Mesh(flecheGeo, bois), b = new THREE.Mesh(bandeGeo, jaune);
    p.position.y = 0.75;
    f.position.set(0.32, 1.32, 0);
    b.position.set(0.62, 1.32, 0);
    for (const m of [p, f, b]) { m.castShadow = qualite.ombres; g.add(m); }
    g.position.copy(pied);
    g.rotation.y = Math.atan2(-cap.z, cap.x);
    scene.add(g);
  }
  for (const v of variantes) {
    const e = etapes[v.etape];
    poteau(v.point(7).addScaledVector(e.avant, 1.4), v.tangente(10));
    const t = v.tangente(v.longueur);
    poteau(v.point(v.longueur).addScaledVector(t, 1.6), new THREE.Vector3(-t.z, 0, t.x));
  }

  let largeur = 1, hauteur = 1, surLeCote = true, visee = VISEE, geo = null;
  const vue = new THREE.Vector3(), axeX = new THREE.Vector3();

  function disposer() {
    largeur = hote.clientWidth;
    hauteur = hote.clientHeight;
    camera.aspect = largeur / hauteur;
    camera.updateProjectionMatrix();
    rendu.setSize(largeur, hauteur, false);
    couche.setSize(largeur, hauteur);

    // Les panneaux restent au bord du chemin dès que la fenêtre a la place ; plus elle est étroite, plus le regard s'y tourne.
    const format = largeur / hauteur;
    surLeCote = format >= 1.2 && largeur >= 900;
    visee = VISEE + 0.2 * (1 - lisse(format, 1.2, 1.45));
    const portrait = !surLeCote;
    const metresParPixel = 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) * RECUL_PANNEAU / hauteur;
    const reserveTableau = 84;

    geo = { metresParPixel, place: hauteur - reserveTableau - 32, portrait };
    for (const e of etapes) {
      // Un panneau trop long se replie : on mesure ses deux hauteurs, bouton compris.
      const plafond = e.el.matches('.panneau-livre') ? HAUT_MAX_LIVRE : e.el.matches('.panneau-compact') ? HAUT_MAX_COMPACT : HAUT_MAX_PANNEAU;
      e.el.style.maxHeight = '';
      e.el.classList.remove('repliable');
      const nu = e.el.offsetHeight;
      e.el.classList.add('repliable');
      e.hPlein = e.el.offsetHeight;
      e.hRepli = Math.min(e.hPlein, Math.max(240, Math.min(geo.place, plafond)));
      // Un panneau qui tient sans le bouton n'a pas à se replier.
      e.repliable = nu > e.hRepli + 1;
      e.el.classList.toggle('repliable', e.repliable);
      e.etat ??= 'replie';
      e.ajuste = e.ajusteCible = e.ajusteAffiche = 1;
      e.transition = e.etat === 'replie' ? 0 : 1;
      e.el.style.setProperty('--fissure', `${e.hRepli}px`);
      placer(e);
    }
  }

  // Place un panneau, ses poteaux et le cadrage de la caméra devant lui.
  // Pendant la chute de la planche cassée, ou sa remontée, le panneau ne montre que sa partie haute,
  // posée à sa place définitive : la planche montre le reste.
  function placer(e) {
    const { metresParPixel, place, portrait } = geo;
    const ouvert = e.repliable && e.etat !== 'replie', entier = !e.repliable || e.etat !== 'chute' && e.etat !== 'remonte';
    e.el.style.maxHeight = e.repliable ? `${e.etat === 'deplie' ? e.hPlein : e.hRepli}px` : '';
    e.el.classList.toggle('en-chute', !entier);
    const w = e.el.offsetWidth, h0 = e.repliable ? e.hRepli : e.el.offsetHeight, h = ouvert ? e.hPlein : h0;
    // Déplié, le panneau peut rapetisser (e.ajuste) pour ne pas passer sous le tableau de bord ;
    // il y glisse en douceur pendant la chute plutôt que d'un coup.
    const r0 = Math.min(1, place / h0, (largeur - 24) / w), r1 = Math.min(1, place / h, (largeur - 24) / w) * e.ajuste;
    const t = e.transition * e.transition * (3 - 2 * e.transition);
    const reduction = ouvert ? THREE.MathUtils.lerp(r0, r1, t) : r0;
    const s = metresParPixel * reduction;
    const s0 = metresParPixel * r0;
    const lw = w * s, lh = h * s, lh0 = h0 * s0;
    const auDessus = portrait;

    const centre = new THREE.Vector3();
    if (auDessus) {
      // Le panneau enjambe le sentier : le coureur passe dessous.
      sentier.point(e.d + DEVANT, centre);
      centre.y += 2.45 + lh0 - lh / 2;
      e.ox = 0;
      e.oy = hauteur / 2 - lh0 / metresParPixel / 2 - 18;
    } else {
      centre.copy(e.lateral);
      centre.y = e.sol.y + 0.65 + lh0 - lh / 2;
      e.ox = 0;
      // La caméra reste à l'horizontale : dans une montée, on décale l'image pour garder le haut du panneau.
      const hautPanneau = (e.sol.y + 0.65 + lh0 - e.cam.y) / metresParPixel;
      // Dans une descente, c'est le coureur qui glisserait sous le tableau de bord : on remonte l'image.
      const piedsCoureur = (e.cam.y - sentier.point(e.d).y) / (metresParPixel * CAM_RECUL / RECUL_PANNEAU);
      // La marge couvre aussi la perspective : un panneau un peu plus proche paraît plus grand que prévu.
      const marge = hauteur / 2 - 46 - hautPanneau;
      e.oy = marge < 0 ? marge : Math.max(0, Math.min(piedsCoureur - (hauteur / 2 - 150), marge));
    }
    // Déplié, le panneau garde son haut : sa partie basse descend devant le chemin et les herbes,
    // et la caméra garde exactement le cadrage du panneau replié.
    e.centre = centre;
    e.mire = centre.clone().setY(centre.y + (lh - lh0) / 2);

    // Le panneau reste parallèle à l'image, pour qu'il ne paraisse jamais de travers à l'arrêt.
    const vise = sentier.point(e.d + 8).setY(0).lerp(centre.clone().setY(0), portrait ? 1 : visee);
    const lhVu = entier ? lh : h0 * s;
    const centreVu = centre.clone().setY(centre.y + (lh - lhVu) / 2);
    // Visé depuis sa propre hauteur, il reste d'aplomb quelle que soit la partie montrée.
    const face = centreVu.clone().add(e.cam.clone().setY(0).sub(vise).setY(0));
    e.objet.position.copy(centreVu);
    e.objet.scale.setScalar(s);
    e.objet.lookAt(face);
    e.fenetre.position.copy(centreVu);
    e.fenetre.quaternion.copy(e.objet.quaternion);
    e.fenetre.scale.set(lw, lhVu, 1);
    e.charniere = centreVu.clone().setY(centreVu.y - lhVu / 2);
    e.planche = { lw, lp: lh - lhVu, s };

    axeX.set(1, 0, 0).applyQuaternion(e.objet.quaternion);
    vue.set(0, 0, 1).applyQuaternion(e.objet.quaternion);
    e.vue = vue.clone();
    e.cadre.position.copy(centreVu).addScaledVector(vue, -0.05);
    e.cadre.quaternion.copy(e.objet.quaternion);
    e.cadre.scale.set(lw + 0.08, lhVu + 0.08, 0.08);

    const sol = auDessus ? sentier.point(e.d + DEVANT).y : e.sol.y;
    const hautPoste = centre.y + lh * 0.2;
    for (const [poste, c] of [[e.posteG, -1], [e.posteD, 1]]) {
      poste.position.copy(centre).addScaledVector(axeX, c * (lw / 2 - lw * 0.06)).addScaledVector(vue, -0.13);
      poste.position.y = (sol + hautPoste) / 2;
      poste.scale.set(1, Math.max(0.05, hautPoste - sol + 0.3), 1);
    }
  }

  // « Voir la suite » : le bas du panneau, délabré, lâche et tombe en se balançant sur sa charnière ;
  // « Replier » le remonte. Quitter le panneau le replie aussi.
  const ouvertOuOuvrant = e => e.etat === 'chute' || e.etat === 'deplie';
  const deplier = (e, oui) => {
    if (!e.repliable || oui === ouvertOuOuvrant(e)) return;
    const bouton = e.el.querySelector('.suite');
    bouton.setAttribute('aria-expanded', String(oui));
    bouton.textContent = oui ? 'Replier' : 'Voir la suite';
    e.el.classList.toggle('deplie', oui);
    const dejaLa = e.chute;
    if (oui && e.etat === 'replie') e.ajuste = e.ajusteCible = prevoirAjuste(e);
    e.etat = oui ? 'chute' : 'remonte';
    placer(e);
    e.chute ??= creerPlanche(e);
    // Une planche déjà en mouvement repart de là où elle en est.
    if (!dejaLa) Object.assign(e.chute, { angle: oui ? CHUTE.depart : 0, biais: 0, vBiais: 0 });
    Object.assign(e.chute, { vitesse: 0, secoue: !oui, t: 0 });
    poserPlanche(e);
  };
  for (const e of etapes) e.el.querySelector('.suite').addEventListener('click', () => deplier(e, !ouvertOuOuvrant(e)));

  // Le panneau replié affiché donne sa taille à l'écran : on en déduit celle du panneau entier,
  // et de combien il doit rapetisser pour s'arrêter au-dessus du tableau de bord.
  const limiteBas = () => (surLeCote ? hauteur - 84 : elModes.getBoundingClientRect().top) - 10;
  function prevoirAjuste(e) {
    const r = e.el.getBoundingClientRect(), w = e.el.offsetWidth, { place } = geo;
    if (!r.height) return 1;
    const r0 = Math.min(1, place / e.hRepli, (largeur - 24) / w), r1 = Math.min(1, place / e.hPlein, (largeur - 24) / w);
    const plein = r.height * (e.hPlein / e.hRepli) * (r1 / r0);
    // Un peu de marge : la perspective grossit le bas, et une correction après coup se verrait.
    return THREE.MathUtils.clamp((limiteBas() - 8 - r.top) / plein, 0.6, 1);
  }

  // La planche cassée est une copie de la partie basse du panneau déplié, avec sa fenêtre et son dos en bois.
  const AXE_X = new THREE.Vector3(1, 0, 0), AXE_Z = new THREE.Vector3(0, 0, 1);
  const qBascule = new THREE.Quaternion(), qBiais = new THREE.Quaternion();
  function creerPlanche(e) {
    const el = document.createElement('div');
    el.className = 'planche-cassee';
    el.inert = true;
    el.setAttribute('aria-hidden', 'true');
    const copie = e.el.cloneNode(true);
    copie.removeAttribute('aria-labelledby');
    for (const n of [copie, ...copie.querySelectorAll('[id]')]) n.removeAttribute('id');
    copie.classList.remove('en-chute');
    copie.classList.add('deplie');
    copie.querySelector('.suite').textContent = 'Replier';
    copie.style.cssText = `position: absolute; left: 0; top: ${-e.hRepli}px; width: ${e.el.offsetWidth}px; max-height: none;`;
    el.append(copie);
    el.style.width = `${e.el.offsetWidth}px`;
    el.style.height = `${e.hPlein - e.hRepli}px`;
    const objet = new CSS3DObject(el);
    el.style.pointerEvents = 'none';
    const fenetre = new THREE.Mesh(fenetreGeo, e.fenetre.material);
    fenetre.renderOrder = 10;
    const dos = new THREE.Mesh(cadreGeo, bois);
    // Elle pend à un clou près de son coin gauche : c'est autour de lui qu'elle penche.
    const pivot = new THREE.Object3D(), clou = new THREE.Object3D();
    clou.add(objet, fenetre, dos);
    pivot.add(clou);
    scene.add(pivot);
    return { pivot, clou, objet, fenetre, dos };
  }
  function poserPlanche(e) {
    const c = e.chute, { lw, lp, s } = e.planche, x = -lw * 0.42;
    c.pivot.position.copy(e.charniere);
    c.pivot.quaternion.copy(e.objet.quaternion).multiply(qBascule.setFromAxisAngle(AXE_X, c.angle));
    c.clou.position.set(x, 0, 0);
    c.clou.quaternion.copy(qBiais.setFromAxisAngle(AXE_Z, c.biais ?? 0));
    for (const m of [c.objet, c.fenetre, c.dos]) m.position.set(-x, -lp / 2, 0);
    c.objet.scale.setScalar(s);
    c.fenetre.scale.set(lw, lp, 1);
    c.dos.position.z = -0.05;
    c.dos.scale.set(lw + 0.08, lp + 0.04, 0.08);
  }
  function retirerPlanche(e) {
    scene.remove(e.chute.pivot);
    e.chute.objet.element.remove();
    e.chute = null;
  }
  function animerPlanche(e, dt) {
    const c = e.chute;
    c.t = (c.t ?? 0) + dt;
    if (e.etat === 'chute') {
      // Les derniers balancements s'éteignent plus vite : la planche se pose au lieu de frémir.
      const calme = 1 + 3 * lisse(c.t, 0.9, 1.7);
      c.vitesse += (-CHUTE.raideur * Math.sin(c.angle) - CHUTE.amorti * calme * c.vitesse) * dt;
      c.angle += c.vitesse * dt;
      // En passant à la verticale, elle accroche : le clou la fait pencher et osciller.
      if (!c.secoue && c.angle < 0) { c.secoue = true; c.vBiais += CHUTE.secousse; }
      c.vBiais += (-CHUTE.raideurBiais * c.biais - CHUTE.amortiBiais * calme * c.vBiais) * dt;
      c.biais += c.vBiais * dt;
      // Le vrai panneau ne la remplace qu'une fois immobile et à pleine échelle : le relais ne se voit pas.
      if (c.secoue && e.transition === 1 && Math.abs(c.angle) < 0.002 && Math.abs(c.vitesse) < 0.02 && Math.abs(c.biais) < 0.0015 && Math.abs(c.vBiais) < 0.015) {
        retirerPlanche(e);
        e.etat = 'deplie';
        placer(e);
        return;
      }
    } else {
      // On la remonte d'un geste qui accélère, puis elle se range derrière le panneau.
      c.vitesse += CHUTE.remontee * dt;
      c.angle = Math.min(CHUTE.depart, c.angle + c.vitesse * dt);
      c.biais = (c.biais ?? 0) * Math.exp(-8 * dt);
      if (c.angle >= CHUTE.depart && e.transition === 0) {
        retirerPlanche(e);
        e.etat = 'replie';
        e.ajuste = e.ajusteCible = 1;
        placer(e);
        return;
      }
    }
    poserPlanche(e);
  }

  // La visite avance par étapes : le coureur fait tout le trajet d'un panneau à l'autre.
  const n = etapes.length;
  let courante = 0, plafond = 0, pause = false, sonde = null, chronoArrivee = 0;
  const FIN_ARRIVEE = 2.075;
  // Sur une variante, tout geste de navigation ramène d'abord au sentier.
  const allerA = i => {
    if (enVariante) return rebrousser();
    attente = null;
    courante = THREE.MathUtils.clamp(i, 0, n - 1);
    for (const e of etapes) if (e !== etapes[courante]) deplier(e, false);
    plafond = Math.max(10, Math.abs(etapes[courante].d - distance) / TRAVERSEE);
  };

  // La variante : aller jusqu'à la clairière, y lire la fiche, puis revenir au panneau.
  let enVariante = null, phase = 'aller', s = 0, vs = 0, attente = null;
  const ficheOuverte = () => document.querySelector('.fiche[open]');
  function prendre(v) {
    if (!v || enVariante) return;
    if (courante !== v.etape || Math.abs(distance - etapes[v.etape].d) > 0.6) {
      allerA(v.etape);
      attente = v;
      return;
    }
    enVariante = v; phase = 'aller'; s = 0; vs = 0; attente = null;
  }
  function rebrousser() {
    if (enVariante && phase !== 'retour') phase = 'retour';
  }
  explorer = fiche => {
    const v = variantes.find(x => x.fiche === fiche);
    v ? prendre(v) : fiche.showModal();
  };
  for (const v of variantes) v.fiche.addEventListener('close', rebrousser);

  const indice = document.getElementById('variante');
  const indiceTexte = document.getElementById('variante-texte'), indiceTouche = indice.querySelector('kbd');
  let indiceActuel = '', annoncee = -1, finAnnonce = 0;
  if (matchMedia('(pointer: coarse)').matches) document.documentElement.classList.add('tactile');
  indice.addEventListener('click', () => enVariante ? rebrousser() : prendre(etapes[courante].variante));

  // Tableau de bord : le profil de la course, avec un repère cliquable par étape.
  document.getElementById('tableau').hidden = false;
  const elKm = document.getElementById('km'), elAlti = document.getElementById('alti');
  const elModes = document.querySelector('#tableau .modes');
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
    const nom = e.el.querySelector('h1, h2').textContent;
    b.setAttribute('aria-label', `Aller à : ${nom}`);
    // L'étiquette ne déborde jamais de l'écran : aux deux bouts du profil, elle s'aligne sur le repère.
    const etiquette = document.createElement('span');
    etiquette.className = 'etape-nom';
    etiquette.textContent = i === 0 ? 'Départ' : nom;
    etiquette.setAttribute('aria-hidden', 'true');
    b.append(etiquette);
    const x = px(e.d) / 1000;
    if (x < 0.12) b.dataset.bord = 'debut';
    else if (x > 0.88) b.dataset.bord = 'fin';
    b.addEventListener('click', () => allerA(i));
    e.repere = b;
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
      // Une fiche ouverte défile normalement.
      if (ficheOuverte()) return;
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
      if (departY === null || ficheOuverte()) return;
      const glisse = departY - ev.changedTouches[0].clientY;
      departY = null;
      if (Math.abs(glisse) >= SEUIL_GESTE * 0.6) allerA(courante + Math.sign(glisse));
    }, { passive: true });

    addEventListener('keydown', ev => {
      if (ev.altKey || ev.ctrlKey || ev.metaKey || ficheOuverte()) return;
      if (ev.key === 'e' || ev.key === 'E') {
        if (!etapes[courante].variante) return;
        prendre(etapes[courante].variante);
        return ev.preventDefault();
      }
      if (ev.key === 'Escape' && enVariante) {
        rebrousser();
        return ev.preventDefault();
      }
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

    for (const e of etapes) {
      if (!e.repliable) continue;
      // Ouvert, le panneau passe devant le coureur et les herbes : sa fenêtre est percée en dernier, par-dessus tout.
      e.fenetre.material.depthTest = e.etat === 'replie';
      e.fenetre.renderOrder = e.etat === 'replie' ? 0 : 10;
      if (e.etat === 'replie') continue;
      const transition = THREE.MathUtils.clamp(e.transition + (e.etat === 'remonte' ? -dt : dt) / CHUTE.echelle, 0, 1);
      const ajuste = e.ajuste + (e.ajusteCible - e.ajuste) * (1 - Math.exp(-3 * dt));
      const bouge = transition !== e.transition || Math.abs(ajuste - e.ajuste) > 1e-4;
      e.transition = transition;
      e.ajuste = Math.abs(ajuste - e.ajusteCible) < 1e-4 ? e.ajusteCible : ajuste;
      if (bouge) placer(e);
      if (e.chute) animerPlanche(e, dt);
    }

    // Une vraie course : il accélère, tient son allure, puis freine en arrivant au panneau.
    // S'il doit repartir dans l'autre sens, il freine trois fois plus fort.
    const ecart = pause || enVariante ? 0 : etapes[courante].d - distance;
    const voulue = Math.sign(ecart) * Math.min(Math.sqrt(2 * ACCELERATION * Math.abs(ecart)), Math.abs(ecart) * 3, plafond);
    const reprise = (voulue * vitesse < 0 ? ACCELERATION * 3 : ACCELERATION) * dt;
    if (pause || enVariante) vitesse = 0;
    vitesse += THREE.MathUtils.clamp(voulue - vitesse, -reprise, reprise);
    distance += vitesse * dt;
    if (Math.abs(vitesse) > 0.5) sens = Math.sign(vitesse);
    if (attente && Math.abs(etapes[attente.etape].d - distance) < 0.3 && Math.abs(vitesse) < 0.5) prendre(attente);

    // Sur la variante, même course : il accélère, puis freine en entrant dans la clairière.
    if (enVariante) {
      const reste = (phase === 'retour' ? 0 : enVariante.longueur - 3) - s;
      const voulueV = Math.sign(reste) * Math.min(Math.sqrt(2 * ACCELERATION * Math.abs(reste)), Math.abs(reste) * 3, 8);
      const repriseV = (voulueV * vs < 0 ? ACCELERATION * 3 : ACCELERATION) * dt;
      vs += THREE.MathUtils.clamp(voulueV - vs, -repriseV, repriseV);
      s += vs * dt;
      if (Math.abs(vs) > 0.5) sens = Math.sign(vs);
      if (Math.abs(reste) < 0.05 && Math.abs(vs) < 0.3) {
        if (phase === 'aller') { phase = 'clairiere'; enVariante.fiche.showModal(); }
        else if (phase === 'retour') { enVariante = null; s = vs = 0; sens = 1; }
      }
    }
    const allure = enVariante ? vs : vitesse, parcours = distance + (enVariante ? s : 0);

    if (enVariante) {
      enVariante.prolonge(s, foyer);
      enVariante.tangente(Math.max(s, 0.5), tan);
    } else {
      sentier.point(distance, foyer);
      sentier.tangente(distance, tan);
    }
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
    // En s'engageant sur la variante, le regard quitte le panneau et suit la trace.
    if (enVariante) {
      poids *= 1 - lisse(s, 0, 6);
      enVariante.prolonge(s - CAM_RECUL, pos).setY(pos.y + CAM_HAUT);
      enVariante.prolonge(s + 8, regard).setY(regard.y + 1.15);
    } else {
      camBase(distance, pos);
      sentier.point(distance + 8, regard).setY(regard.y + 1.15);
    }
    // Sur grand écran le coureur reste le sujet : la caméra ne fait qu'entrouvrir le regard vers le panneau.
    cible.copy(regard).lerp(proche.mire, poids * (surLeCote ? visee : 1));
    const pas = lisse(Math.abs(allure), 0.2, 4);
    pos.y += 0.016 * pas * Math.sin(parcours / 3.1 * Math.PI * 4);
    pos.x += 0.012 * pas * Math.sin(parcours / 3.1 * Math.PI * 2);
    // Devant un panneau, le regard revient à l'horizontale : le texte reste droit, même dans une pente.
    if (surLeCote) cible.y += (pos.y - cible.y) * poids;
    camera.position.copy(pos);
    camera.lookAt(cible);
    if (sonde) { camera.position.set(foyer.x + sonde.x, foyer.y + sonde.y, foyer.z + sonde.z); camera.lookAt(foyer.x, foyer.y + 1.55, foyer.z); }

    const ox = sonde ? 0 : proche.ox * poids, oy = sonde ? 0 : proche.oy * poids;
    camera.setViewOffset(largeur, hauteur, ox, oy, largeur, hauteur);

    // Une fois déplié et immobile, on vérifie sur l'image affichée qu'il s'arrête bien au-dessus du tableau de bord ;
    // s'il dépasse encore, il rapetisse en douceur.
    if (proche.etat === 'deplie' && proche.etatAffiche === 'deplie' && proche.ajuste === proche.ajusteCible && poids > 0.9 && !sonde) {
      const r = proche.el.getBoundingClientRect();
      const voulu = proche.ajusteAffiche * THREE.MathUtils.clamp((limiteBas() - r.top) / r.height, 0.6, 1);
      if (r.height > 0 && voulu < proche.ajusteCible - 0.003) proche.ajusteCible = voulu;
    }

    const angleRegard = poids > 0.4 ? proche.cote * -0.55 * poids * (1 - retournement) : 0;
    const appui = coureur.animer(dt, duree, parcours, allure, victoire, angleRegard, 4 * retournement * (1 - retournement));
    if (appui) {
      particules.appui(foyer);
      son.pas(Math.abs(allure));
    }

    // À l'arrivée sur une étape, son nom s'allume un instant sur le profil.
    const ici = etapes[courante];
    const arrete = !enVariante && Math.abs(distance - ici.d) < 0.6 && Math.abs(vitesse) < 0.5;
    if (arrete && annoncee !== courante) {
      annoncee = courante;
      clearTimeout(finAnnonce);
      for (const e of etapes) e.repere.classList.toggle('annonce', e === ici);
      finAnnonce = setTimeout(() => ici.repere.classList.remove('annonce'), 2400);
    }

    // L'indication n'apparaît qu'à l'arrêt devant un projet, ou pour rebrousser chemin en cours de variante.
    const texte = enVariante ? (phase === 'aller' ? 'Revenir au sentier|Échap' : '')
      : ici.variante && Math.abs(distance - ici.d) < 0.6 && Math.abs(vitesse) < 0.5 ? `Variante vers ${ici.variante.nom}|E` : '';
    if (texte !== indiceActuel) {
      indiceActuel = texte;
      indice.hidden = !texte;
      const [libelle, touche] = texte.split('|');
      indiceTexte.textContent = libelle ?? '';
      indiceTouche.textContent = touche ?? '';
      indice.setAttribute('aria-label', touche ? `${libelle} (touche ${touche})` : libelle ?? '');
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
      // Seul le panneau devant lequel on s'arrête répond à la souris : un panneau hors champ captait les clics.
      e.el.style.pointerEvents = visible && poids > 0.5 && e === proche ? 'auto' : 'none';
      if (!visible) continue;
      const f = 1 - Math.exp(-((scene.fog.density * ecart) ** 2));
      // Un léger voile, même de près : la planche prend la lumière de l'air qui l'entoure.
      e.fenetre.material.uniforms.uAlpha.value = Math.max(0.1 + meteo.etat.nuit * 0.26, f);
      e.fenetre.material.uniforms.uBrume.value.copy(scene.fog.color).convertLinearToSRGB();
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
    for (const e of etapes) Object.assign(e, { ajusteAffiche: e.ajuste, etatAffiche: e.etat });

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
    if (params.has('debug')) window.__sentier = { chrono: () => chronoArrivee, sonde: v => { sonde = v; }, poser: d => { pause = true; distance = d; }, sentier, meteo: meteo.etat, etapes, camera, scene, allerA, camBase, rendu, hauteur: monde.hauteur, etape: () => courante, saut: () => { distance = etapes[courante].d; vitesse = 0; }, variantes, prendre, phase: () => enVariante ? phase : 'sentier', sautVariante: () => { if (enVariante) { s = phase === 'retour' ? 0 : enVariante.longueur - 3; vs = 0; } } };
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
