// Le monde : sentier, relief, forêt, ciel et lumière qui avance avec la journée.
// Aucune image à charger : feuillages, écorce et sols sont peints au démarrage sur des canvas.
import * as THREE from 'three';

const V = (x, y, z) => new THREE.Vector3(x, y, z);
export const lisse = THREE.MathUtils.smoothstep;
const mix = THREE.MathUtils.lerp;

// Graine fixe : la forêt est la même à chaque visite.
function hasard(graine) {
  let s = graine;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function bruit2(x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const fx = x - xi, fy = y - yi;
  const h = (a, b) => {
    const v = Math.sin(a * 127.1 + b * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  const u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
  return mix(mix(h(xi, yi), h(xi + 1, yi), u), mix(h(xi, yi + 1), h(xi + 1, yi + 1), u), v);
}
const fbm = (x, y) => bruit2(x, y) * 0.55 + bruit2(x * 2.1, y * 2.1) * 0.3 + bruit2(x * 4.3, y * 4.3) * 0.15;

// Le tracé : il monte et descend en lacets, et chaque panneau attend juste après un virage.
const TRACE = [
  [0, 0, 40], [0, 0, 10], [1, 1.5, -20], [-6, 5, -50], [-26, 9, -78], [-30, 6, -108],
  [-12, 2, -136], [14, 5, -156], [34, 10, -182], [30, 14, -214], [6, 11, -240], [-20, 7, -258],
  [-40, 12, -284], [-34, 18, -316], [-8, 24, -338], [20, 20, -352], [44, 15, -376], [46, 22, -410],
  [26, 30, -438], [2, 37, -456], [-14, 43, -480], [-16, 46, -510], [-16, 46, -540],
];

// Le pont enjambe un ruisseau au creux d'une descente.
const PONT = { d: 172, demiLongueur: 7.5, bombe: 0.7, largeur: 1.25, profondeur: 3.2 };

export function creerSentier() {
  const courbe = new THREE.CatmullRomCurve3(TRACE.map(p => V(...p)), false, 'centripetal');
  const longueur = courbe.getLength();
  const n = Math.ceil(longueur);
  const points = courbe.getSpacedPoints(n);
  for (let i = 0; i <= n; i++) {
    const ecart = Math.abs(i / n * longueur - PONT.d);
    if (ecart < PONT.demiLongueur + 1.5) points[i].y += PONT.bombe * Math.cos(Math.PI / 2 * ecart / (PONT.demiLongueur + 1.5)) ** 2;
  }

  function point(d, cible = new THREE.Vector3()) {
    const f = THREE.MathUtils.clamp(d / longueur, 0, 1) * n;
    const i = Math.min(Math.floor(f), n - 1);
    return cible.copy(points[i]).lerp(points[i + 1], f - i);
  }
  function tangente(d, cible = new THREE.Vector3()) {
    const a = point(d - 1.5), b = point(d + 1.5);
    return cible.copy(b).sub(a).setY(0).normalize();
  }

  // Appelé des centaines de milliers de fois au démarrage : le tronçon proche est mémorisé par carré de 4 m.
  const memo = new Map();
  function troncon(x, z) {
    const cle = Math.floor(x / 4) * 100000 + Math.floor(z / 4);
    let d = memo.get(cle);
    if (d === undefined) {
      let meilleur = Infinity;
      for (let i = 0; i <= n; i += 3) {
        const e = (points[i].x - x) ** 2 + (points[i].z - z) ** 2;
        if (e < meilleur) { meilleur = e; d = i; }
      }
      memo.set(cle, d);
    }
    return d;
  }
  function plusProche(x, z) {
    const centre = troncon(x, z);
    let meilleur = Infinity, y = 0, d = 0;
    for (let f = Math.max(0, centre - 9); f <= Math.min(n, centre + 9); f++) {
      const p = points[f], e = (p.x - x) ** 2 + (p.z - z) ** 2;
      if (e < meilleur) { meilleur = e; y = p.y; d = f; }
    }
    return { distance: Math.sqrt(meilleur), y, d };
  }

  return { longueur, point, tangente, plusProche };
}

function peindre(taille, dessin, repete = false) {
  const c = document.createElement('canvas');
  c.width = c.height = taille;
  dessin(c.getContext('2d'), taille);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  if (repete) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Des touches claires sur un fond neutre : la teinte vient ensuite de chaque plante.
function peindreSol(base, touches, r) {
  return peindre(512, (x, t) => {
    x.fillStyle = base;
    x.fillRect(0, 0, t, t);
    for (let i = 0; i < 16000; i++) {
      const v = 150 + r() * 105 | 0;
      x.strokeStyle = `rgba(${v},${v},${v},${0.1 + r() * 0.3})`;
      x.lineWidth = 0.6 + r() * 1.6;
      const a = r() * 6.28, l = 2 + r() * touches, px = r() * t, py = r() * t;
      x.beginPath(); x.moveTo(px, py); x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l); x.stroke();
    }
    for (let i = 0; i < 2600; i++) {
      x.fillStyle = `rgba(40,34,26,${0.04 + r() * 0.1})`;
      x.beginPath(); x.arc(r() * t, r() * t, 0.8 + r() * 3.6, 0, 6.28); x.fill();
    }
  }, true);
}

function peindreFeuilles(r) {
  return peindre(256, (x, t) => {
    for (let i = 0; i < 1300; i++) {
      const a = r() * 6.28, d = Math.sqrt(r()) * t * 0.47;
      const px = t / 2 + Math.cos(a) * d, py = t / 2 + Math.sin(a) * d;
      const v = 190 + r() * 65 | 0;
      x.fillStyle = `rgb(${v},${v},${v * 0.92 | 0})`;
      x.save();
      x.translate(px, py); x.rotate(r() * 6.28);
      x.beginPath(); x.ellipse(0, 0, 3 + r() * 5, 1.6 + r() * 2.2, 0, 0, 6.28); x.fill();
      x.restore();
    }
  });
}

// Un rameau de sapin vu de dessus : un axe, et des aiguilles qui en partent vers l'extrémité.
function peindreRameau(r) {
  return peindre(256, (x, t) => {
    x.lineCap = 'round';
    for (let i = 0; i < 900; i++) {
      const y = r() * t;
      const large = (1 - y / t) ** 0.8 * t * 0.48 + 6;
      const v = 190 + r() * 65 | 0;
      x.strokeStyle = `rgb(${v},${v},${v * 0.94 | 0})`;
      x.lineWidth = 1 + r() * 1.5;
      const cote = r() < 0.5 ? -1 : 1, depart = r() * large * 0.75;
      x.beginPath();
      x.moveTo(t / 2 + cote * depart, y);
      x.lineTo(t / 2 + cote * (depart + 10 + r() * 18), y + 8 + r() * 16);
      x.stroke();
    }
  });
}

// Normale « de volume » : tout le houppier s'éclaire comme une masse, et non carte par carte.
function cartes(liste) {
  const pos = [], nor = [], col = [], uv = [];
  const a = V(0, 0, 0), b = V(0, 0, 0), c = V(0, 0, 0), n = V(0, 0, 0);
  for (const q of liste) {
    a.set(q.ux, q.uy, q.uz); b.set(q.vx, q.vy, q.vz);
    const coins = [[-1, -1, 0, 0], [1, -1, 1, 0], [1, 1, 1, 1], [-1, -1, 0, 0], [1, 1, 1, 1], [-1, 1, 0, 1]];
    for (const [s, t, u, v] of coins) {
      c.set(q.x, q.y, q.z).addScaledVector(a, s).addScaledVector(b, t);
      pos.push(c.x, c.y, c.z);
      n.set(c.x - q.cx, (c.y - q.cy) * 1.2 + 0.25, c.z - q.cz).normalize();
      nor.push(n.x, n.y, n.z);
      const ombre = mix(0.62, 1, THREE.MathUtils.clamp(q.lumiere + (t * 0.08), 0, 1));
      col.push(ombre, ombre, ombre);
      uv.push(u, v);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return g;
}

function carteAuHasard(r, x, y, z, taille, centre) {
  const u = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
  const w = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize();
  const v = w.cross(u).normalize();
  return {
    x, y, z, cx: centre.x, cy: centre.y, cz: centre.z,
    ux: u.x * taille, uy: u.y * taille, uz: u.z * taille,
    vx: v.x * taille, vy: v.y * taille, vz: v.z * taille,
  };
}

function houppier(r, nombre, boules, taille) {
  const liste = [];
  const total = boules.reduce((s, b) => s + b.r ** 2, 0);
  const haut = Math.max(...boules.map(b => b.y + b.r)), bas = Math.min(...boules.map(b => b.y - b.r));
  const centre = V(0, (haut + bas) / 2, 0);
  for (const b of boules) {
    const n = Math.round(nombre * b.r ** 2 / total);
    for (let i = 0; i < n; i++) {
      const d = V(r() - 0.5, r() - 0.5, r() - 0.5).normalize().multiplyScalar(b.r * (0.55 + r() * 0.45));
      const p = V(b.x, b.y, b.z).add(d);
      const q = carteAuHasard(r, p.x, p.y, p.z, taille * (0.75 + r() * 0.5), centre);
      q.lumiere = 0.15 + (p.y - bas) / (haut - bas) * 0.85;
      liste.push(q);
    }
  }
  return cartes(liste);
}

function sapinGeo(r) {
  const liste = [], hauteur = 9, centre = V(0, 4.2, 0);
  const etages = 16;
  for (let e = 0; e < etages; e++) {
    const t = e / (etages - 1);
    const y = 1.5 + t * (hauteur - 1.6);
    const rayon = mix(2.7, 0.55, t ** 0.85);
    const n = Math.round(mix(9, 5, t));
    const a0 = r() * 6.28;
    for (let i = 0; i < n; i++) {
      const a = a0 + i / n * 6.28 + r() * 0.3;
      const pente = -0.28 - r() * 0.18;
      // La carte part du tronc (son bord haut, là où le rameau peint est large) et s'étire vers l'extérieur.
      const ux = Math.cos(a), uz = Math.sin(a);
      const large = rayon * 0.8;
      const q = {
        x: ux * rayon / 2, y: y + pente * rayon / 2, z: uz * rayon / 2,
        cx: 0, cy: centre.y, cz: 0,
        ux: -uz * large, uy: 0, uz: ux * large,
        vx: -ux * rayon / 2, vy: -pente * rayon / 2, vz: -uz * rayon / 2,
        lumiere: 0.2 + t * 0.55 + r() * 0.2,
      };
      liste.push(q);
    }
  }
  return cartes(liste);
}

function tronc(rayonBas, rayonHaut, hauteur) {
  const g = new THREE.CylinderGeometry(rayonHaut, rayonBas, hauteur, 8, 2).translate(0, hauteur / 2, 0);
  const p = g.attributes.position;
  // La base s'évase légèrement vers les racines.
  for (let i = 0; i < p.count; i++) {
    const k = 1 + 0.6 * (1 - lisse(p.getY(i), 0, hauteur * 0.2));
    p.setX(i, p.getX(i) * k); p.setZ(i, p.getZ(i) * k);
  }
  g.computeVertexNormals();
  return g;
}

function rocherGeo(r) {
  const g = new THREE.IcosahedronGeometry(1, 3);
  const p = g.attributes.position, v = V(0, 0, 0);
  const dec = r() * 50;
  for (let i = 0; i < p.count; i++) {
    v.fromBufferAttribute(p, i);
    const k = 0.72 + fbm(v.x * 1.4 + v.z + dec, v.y * 1.4 + dec) * 0.6;
    p.setXYZ(i, v.x * k, v.y * k * 0.7, v.z * k);
  }
  const m = new THREE.BufferGeometry().copy(g);
  // Les sommets dupliqués de l'icosaèdre sont soudés par arrondi pour lisser sans couture.
  const cle = i => `${p.getX(i).toFixed(2)},${p.getY(i).toFixed(2)},${p.getZ(i).toFixed(2)}`;
  const n = new Map();
  m.computeVertexNormals();
  const no = m.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    const c = cle(i);
    if (!n.has(c)) n.set(c, V(0, 0, 0));
    n.get(c).x += no.getX(i); n.get(c).y += no.getY(i); n.get(c).z += no.getZ(i);
  }
  for (let i = 0; i < p.count; i++) {
    const s = n.get(cle(i)).clone().normalize();
    no.setXYZ(i, s.x, s.y, s.z);
  }
  return m;
}

function herbeGeo(r) {
  const pos = [], col = [], nor = [];
  for (let i = 0; i < 10; i++) {
    const a = r() * 6.28, px = (r() - 0.5) * 0.8, pz = (r() - 0.5) * 0.8;
    const h = 0.25 + r() * 0.4, pli = 0.1 + r() * 0.2, l = 0.012 + r() * 0.01;
    const cx = Math.cos(a), sz = Math.sin(a);
    const s = [[-l, 0, 0], [l, 0, 0], [-l * 0.6, h * 0.55, pli * 0.35], [l * 0.6, h * 0.55, pli * 0.35], [0, h, pli]];
    const m = s.map(([x, y, z]) => [px + x * cx + z * sz, y, pz - x * sz + z * cx]);
    const c = t => [t, t, t];
    pos.push(...m[0], ...m[1], ...m[2], ...m[1], ...m[3], ...m[2], ...m[2], ...m[3], ...m[4]);
    col.push(...c(0.45), ...c(0.45), ...c(0.75), ...c(0.45), ...c(0.75), ...c(0.75), ...c(0.75), ...c(0.75), ...c(1));
    for (let k = 0; k < 9; k++) nor.push(0, 1, 0);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 3));
  return g;
}

function formes() {
  const r = hasard(7);
  const boulesFeuillu = [
    { x: 0, y: 5.4, z: 0, r: 2.7 }, { x: 1.7, y: 4.5, z: 0.6, r: 1.9 }, { x: -1.6, y: 4.6, z: -0.8, r: 2 },
    { x: 0.3, y: 7.2, z: 0.4, r: 1.8 }, { x: -0.5, y: 4.4, z: 1.7, r: 1.6 }, { x: 0.6, y: 4.5, z: -1.8, r: 1.6 },
  ];
  return {
    sapin: sapinGeo(r),
    sapinTronc: tronc(0.17, 0.03, 8.4),
    feuillu: houppier(r, 90, boulesFeuillu, 1.05),
    feuilluTronc: tronc(0.24, 0.1, 6.2),
    buisson: houppier(r, 34, [{ x: 0, y: 0.75, z: 0, r: 0.95 }, { x: 0.75, y: 0.55, z: 0.2, r: 0.7 }, { x: -0.7, y: 0.6, z: -0.2, r: 0.74 }], 0.5),
    rocher: rocherGeo(r),
    herbe: herbeGeo(r),
  };
}

// La lumière selon la hauteur du soleil en degrés : nuit, heure bleue, couchant, puis plein jour.
const JOURNEE = [
  { e: -18, haut: '#060a16', horizon: '#0e1524', brume: '#0a101b', soleil: '#a9bddd', ombre: '#0f1828', ciel: 1, astre: 1.1, dens: 0.0062 },
  { e: -6, haut: '#1b2950', horizon: '#74566a', brume: '#343a4e', soleil: '#a9bddd', ombre: '#1e2536', ciel: 1.1, astre: 1, dens: 0.0052 },
  { e: 1, haut: '#4f6291', horizon: '#f7b27e', brume: '#d9ab92', soleil: '#ffb37a', ombre: '#736a80', ciel: 2.6, astre: 3, dens: 0.0034 },
  { e: 11, haut: '#6f93c0', horizon: '#f3d6b8', brume: '#dcd2c2', soleil: '#ffdcb4', ombre: '#6c7a8a', ciel: 2.8, astre: 3.5, dens: 0.0056 },
  { e: 35, haut: '#5b93cf', horizon: '#dfe9ea', brume: '#c9d6d4', soleil: '#fff2dc', ombre: '#7b8a78', ciel: 3.1, astre: 4.4, dens: 0.0066 },
  { e: 60, haut: '#4a86cc', horizon: '#e4edf0', brume: '#d0dde0', soleil: '#fff6e6', ombre: '#84907c', ciel: 3.1, astre: 4.4, dens: 0.0052 },
];
const COULEURS = ['haut', 'horizon', 'brume', 'soleil', 'ombre'];
for (const j of JOURNEE) for (const k of COULEURS) j[k] = new THREE.Color(j[k]);

function creerCiel(scene) {
  const uniforms = {
    uHaut: { value: new THREE.Color() }, uHorizon: { value: new THREE.Color() },
    uBrume: { value: new THREE.Color() }, uSoleil: { value: new THREE.Color() },
    uDir: { value: V(0, 1, 0) }, uNuages: { value: 0 }, uEclair: { value: 0 }, uAstre: { value: 1 }, uJour: { value: 1 },
  };
  const ciel = new THREE.Mesh(new THREE.SphereGeometry(850, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false, uniforms,
    vertexShader: `varying vec3 vD; void main(){ vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.); }`,
    fragmentShader: `
      uniform vec3 uHaut, uHorizon, uBrume, uSoleil, uDir; uniform float uNuages, uEclair, uAstre, uJour; varying vec3 vD;
      float h(vec2 p){ return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
      float b(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.-2.*f);
        return mix(mix(h(i), h(i+vec2(1,0)), f.x), mix(h(i+vec2(0,1)), h(i+vec2(1,1)), f.x), f.y); }
      float fbm(vec2 p){ float v = 0., a = .5; for(int i = 0; i < 5; i++){ v += a*b(p); p = p*2.03 + 7.; a *= .5; } return v; }
      float crete(float a, float f, float g){ return sin(a*f+g)*.5 + sin(a*f*2.3+g*1.7)*.28 + sin(a*f*5.1+g*.6)*.12 + sin(a*f*11.+g)*.05; }
      void main(){
        vec3 d = normalize(vD);
        float y = d.y, a = atan(d.x, d.z);
        vec3 c = mix(uHorizon, uHaut, pow(clamp(y*1.3, 0., 1.), .5));
        float s = max(dot(d, uDir), 0.);
        c += uSoleil * (pow(s, 6.)*.22 + pow(s, 80.)*.5) * (1. - uNuages*.9) * uAstre * mix(.18, 1., uJour);
        if (y > 0.) {
          vec3 q = d * 190., cq = floor(q);
          float e = fract(sin(dot(cq, vec3(12.9898, 78.233, 37.719))) * 43758.5453);
          float etoile = smoothstep(.5, .08, length(fract(q) - .5)) * step(.9925, e) * (e - .985) / .015;
          c += vec3(.86, .9, 1.) * etoile * (1. - uJour) * (1. - uNuages) * smoothstep(.08, .3, y);
        }
        if (y > 0.) {
          vec2 p = d.xz / (y + .12) * 1.4;
          float n = smoothstep(mix(.5, .2, uNuages), mix(.78, .52, uNuages), fbm(p));
          vec3 nuage = mix(uHorizon, vec3(1.), .55*uJour) + uSoleil*pow(s, 4.)*.25*(1. - uNuages);
          nuage = mix(nuage, vec3(.5, .53, .57) * (.8 + fbm(p*1.7)*.5) * mix(.09, 1., uJour), uNuages*.85);
          c = mix(c, nuage, n * smoothstep(.02, .22, y) * mix(.85, 1., uNuages));
        }
        c = mix(c, vec3(1.,.98,.94), smoothstep(.9992,.9997,s) * (1. - uNuages) * uAstre);
        float l1 = .06 + .028*crete(a, 3., 1.), l2 = .036 + .024*crete(a, 5., 4.), l3 = .014 + .016*crete(a, 9., 2.);
        vec3 lointain = mix(uHorizon, uHaut, .5);
        c = mix(c, mix(lointain, uBrume, .55), smoothstep(l1+.003, l1, y));
        c = mix(c, mix(lointain, uBrume, .75), smoothstep(l2+.003, l2, y));
        c = mix(c, uBrume, smoothstep(l3+.003, l3, y));
        c += vec3(.75, .8, 1.) * uEclair * .8;
        gl_FragColor = vec4(c, 1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  }));
  ciel.frustumCulled = false;
  ciel.renderOrder = -10;
  scene.add(ciel);
  return { ciel, uniforms };
}

// La neige et la pluie se posent sur tout : la teinte du matériau suit le temps qu'il fait.
function sousLeTemps(s, ambiance, neige) {
  s.uniforms.uNeige = ambiance.uNeige;
  s.uniforms.uMouille = ambiance.uMouille;
  s.fragmentShader = 'uniform float uNeige, uMouille;\n' + s.fragmentShader.replace('#include <color_fragment>', `
    #include <color_fragment>
    diffuseColor.rgb *= 1. - uMouille * .32;
    diffuseColor.rgb = mix(diffuseColor.rgb, vec3(.86, .89, .94), uNeige * ${neige.toFixed(2)});`);
}

function creerSol(sentier, hauteur, qualite, ambiance) {
  const pas = qualite.mobile ? 3 : 2.5;
  const largeur = 400, profondeur = 800;
  const g = new THREE.PlaneGeometry(largeur, profondeur, largeur / pas | 0, profondeur / pas | 0)
    .rotateX(-Math.PI / 2).translate(10, 0, -250);
  const p = g.attributes.position;
  const couleurs = new Float32Array(p.count * 3);
  const pre = new THREE.Color('#6d7440'), sousBois = new THREE.Color('#574f33');
  const mousse = new THREE.Color('#4f5e33'), pierre = new THREE.Color('#7d756a'), sec = new THREE.Color('#8a7f55'), c = new THREE.Color();
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), z = p.getZ(i);
    p.setY(i, hauteur(x, z));
    const u = sentier.plusProche(x, z).d / sentier.longueur;
    const n = fbm(x * 0.05, z * 0.05);
    c.copy(pre).lerp(sousBois, lisse(u, 0.05, 0.2)).lerp(mousse, lisse(n, 0.35, 0.65) * 0.8);
    c.lerp(sec, lisse(u, 0.68, 0.84)).lerp(pierre, lisse(u, 0.78, 0.95) * lisse(n, 0.45, 0.7));
    couleurs.set([c.r, c.g, c.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(couleurs, 3));
  g.computeVertexNormals();
  const uv = g.attributes.uv;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * largeur / 9, uv.getY(i) * profondeur / 9);
  const map = peindreSol('#b8b8b8', 9, hasard(11));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map }));
  m.material.onBeforeCompile = s => sousLeTemps(s, ambiance, 0.72);
  m.receiveShadow = true;
  return m;
}

// Un ruban transparent sur ses bords : le chemin se fond dans l'herbe au lieu de s'y découper.
function creerChemin(sentier, ambiance) {
  const pos = [], col = [], uv = [], indices = [];
  const n = Math.floor(sentier.longueur);
  const t = V(0, 0, 0), a = V(0, 0, 0), terre = new THREE.Color('#a98c68'), pale = new THREE.Color('#c4a983'), c = new THREE.Color();
  const larg = 8;
  for (let i = 0; i <= n; i++) {
    sentier.point(i, a); sentier.tangente(i, t);
    for (let j = 0; j <= larg; j++) {
      const v = j / larg * 2 - 1;
      const bord = 1.5 + fbm(i * 0.13, j * 3 + 2) * 0.8;
      pos.push(a.x - t.z * v * bord, a.y + 0.06, a.z + t.x * v * bord);
      c.copy(terre).lerp(pale, fbm(i * 0.3, j * 1.3));
      col.push(c.r, c.g, c.b, (1 - lisse(Math.abs(v), 0.55, 1)) * lisse(Math.abs(i - PONT.d), PONT.demiLongueur - 2.2, PONT.demiLongueur - 1.2));
      uv.push(v * 0.4, i / 4.5);
      if (i < n && j < larg) {
        const s = i * (larg + 1) + j;
        indices.push(s, s + 1, s + larg + 1, s + 1, s + larg + 2, s + larg + 1);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.Float32BufferAttribute(col, 4));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(indices);
  g.computeVertexNormals();
  const map = peindreSol('#c4c4c4', 5, hasard(23));
  const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, map, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2 }));
  m.material.onBeforeCompile = s => sousLeTemps(s, ambiance, 0.42);
  m.receiveShadow = true;
  return m;
}

// Le vent, et une normale qui ignore la face vue : indispensable pour des cartes de feuillage.
// Tablier, poutres, poteaux et mains courantes, posés le long du sentier.
function creerPont(scene, sentier, ambiance) {
  const pieces = [], p = V(0, 0, 0), t = V(0, 0, 0), a = V(0, 0, 0), b = V(0, 0, 0);
  const r = hasard(77);
  const repere = (centre, avant, ech, teinte) => {
    const m = new THREE.Matrix4().lookAt(avant, V(0, 0, 0), V(0, 1, 0));
    pieces.push({ m: m.setPosition(centre).multiply(new THREE.Matrix4().makeScale(...ech)), teinte });
  };
  const lieu = (d, cote, y) => {
    sentier.point(d, p); sentier.tangente(d, t);
    return V(p.x - t.z * cote, p.y + y, p.z + t.x * cote);
  };
  const { d: d0, demiLongueur: l, largeur } = PONT;

  for (let d = d0 - l; d <= d0 + l; d += 0.42) {
    const av = lieu(d + 0.2, 0, 0).sub(lieu(d - 0.2, 0, 0)).normalize();
    repere(lieu(d, 0, 0.075), av, [largeur * 2 + 0.3, 0.07, 0.36], ['#7a5f45', '#6c533c', '#846a4e'][r() * 3 | 0]);
  }
  // Une poutre d'appui à chaque bout : le tablier repose sur la terre, à fleur du chemin.
  for (const bout of [-1, 1]) {
    const d = d0 + bout * (l - 0.1);
    const av = lieu(d + 0.2, 0, 0).sub(lieu(d - 0.2, 0, 0)).normalize();
    repere(lieu(d, 0, -0.16), av, [largeur * 2 + 0.9, 0.4, 0.5], '#4d3b2c');
  }
  for (const cote of [-1, 1]) {
    for (let d = d0 - l; d < d0 + l - 0.1; d += 1) {
      const u = lieu(d, cote * largeur * 0.8, -0.14), v = lieu(d + 1.02, cote * largeur * 0.8, -0.14);
      repere(a.copy(u).add(v).multiplyScalar(0.5), b.copy(v).sub(u).normalize(), [0.16, 0.22, u.distanceTo(v)], '#4d3b2c');
    }
    let precedent = null;
    for (let d = d0 - l; d <= d0 + l + 0.01; d += l / 4) {
      const av = lieu(d + 0.2, 0, 0).sub(lieu(d - 0.2, 0, 0)).normalize();
      repere(lieu(d, cote * (largeur + 0.1), 0.45), av, [0.1, 1.05, 0.1], '#5a4633');
      const main = lieu(d, cote * (largeur + 0.1), 0.98);
      if (precedent) {
        const longueur = main.distanceTo(precedent);
        b.copy(main).sub(precedent).normalize();
        repere(a.copy(main).add(precedent).multiplyScalar(0.5), b, [0.07, 0.07, longueur], '#6b533c');
        repere(a.setY(a.y - 0.43), b, [0.05, 0.05, longueur], '#5a4633');
      }
      precedent = main;
    }
    // Les piles qui portent le pont depuis le fond du ravin.
    for (const e of [-0.42, 0, 0.42]) {
      repere(lieu(d0 + l * e, cote * largeur * 0.8, -PONT.profondeur / 2 - 0.2), V(0, 0, 1), [0.2, PONT.profondeur + 0.2, 0.2], '#463528');
    }
  }

  const mat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  mat.onBeforeCompile = s => sousLeTemps(s, ambiance, 0.45);
  const inst = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), mat, pieces.length);
  const c = new THREE.Color();
  pieces.forEach((o, i) => { inst.setMatrixAt(i, o.m); inst.setColorAt(i, c.set(o.teinte)); });
  inst.castShadow = inst.receiveShadow = true;
  inst.frustumCulled = false;
  scene.add(inst);
}

function creerRuisseau(scene, sentier, niveau, ambiance) {
  const p = sentier.point(PONT.d), t = sentier.tangente(PONT.d);
  const map = peindreSol('#9a9a9a', 22, hasard(53));
  map.repeat.set(2, 24);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(7.6, 190).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: '#6f7f73', map, roughness: 0.3, metalness: 0.1, transparent: true, opacity: 0.92 }),
  );
  m.material.onBeforeCompile = s => sousLeTemps(s, ambiance, 0.15);
  m.position.set(p.x, niveau, p.z);
  m.rotation.y = Math.atan2(t.x, t.z) + Math.PI / 2;
  m.receiveShadow = true;
  scene.add(m);
  return dt => { map.offset.y -= dt * 0.12; };
}

function materielVegetal(temps, options, amplitude, ambiance, neige) {
  const m = new THREE.MeshLambertMaterial({ vertexColors: true, side: THREE.DoubleSide, ...options });
  m.onBeforeCompile = s => {
    s.uniforms.uTemps = temps;
    s.uniforms.uVent = ambiance.uVent;
    sousLeTemps(s, ambiance, neige);
    s.vertexShader = 'uniform float uTemps, uVent;\n' + s.vertexShader.replace('#include <begin_vertex>', `
      #include <begin_vertex>
      #ifdef USE_INSTANCING
        float base = instanceMatrix[3].x * .21 + instanceMatrix[3].z * .17;
        float souffle = transformed.y * transformed.y * ${amplitude.toFixed(4)} * uVent;
        transformed.x += sin(uTemps * 1.3 + base + transformed.y * .4) * souffle;
        transformed.z += cos(uTemps * .9 + base * 1.4) * souffle;
      #endif`);
    s.fragmentShader = s.fragmentShader.replace('#include <normal_fragment_begin>',
      'vec3 normal = normalize(vNormal); vec3 nonPerturbedNormal = normal;');
  };
  return m;
}

// Une parcelle par carré de 60 m : le moteur ignore tout ce qui sort du champ de la caméra ou de l'ombre.
function peupler(scene, liste, geo, mat, ombre, toutes, portee = Infinity) {
  const parcelles = new Map();
  for (const o of liste) {
    const cle = `${Math.floor(o.x / 60)},${Math.floor(o.z / 60)}`;
    if (!parcelles.has(cle)) parcelles.set(cle, []);
    parcelles.get(cle).push(o);
  }
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler();
  const c = new THREE.Color();
  for (const groupe of parcelles.values()) {
    const inst = new THREE.InstancedMesh(geo, mat, groupe.length);
    groupe.forEach((o, i) => {
      e.set(0, o.rot, 0);
      q.setFromEuler(e);
      m.compose(V(o.x, o.y, o.z), q, V(o.ex ?? o.ech, o.ech, o.ex ?? o.ech));
      inst.setMatrixAt(i, m);
      inst.setColorAt(i, c.set(o.teinte));
    });
    inst.computeBoundingSphere();
    inst.castShadow = ombre;
    inst.receiveShadow = true;
    inst.userData.portee = portee;
    scene.add(inst);
    toutes.push(inst);
  }
}

export function creerMonde(scene, sentier, zones, qualite) {
  const r = hasard(1983);
  const temps = { value: 0 };

  // Le ravin suit l'axe perpendiculaire au sentier, et se referme de part et d'autre du pont.
  const pontP = sentier.point(PONT.d), pontT = sentier.tangente(PONT.d);
  const niveauEau = pontP.y - PONT.profondeur;
  const ravine = (x, z) => {
    const dx = x - pontP.x, dz = z - pontP.z;
    const long = dx * pontT.x + dz * pontT.z, large = dx * -pontT.z + dz * pontT.x;
    if (Math.abs(long) > PONT.demiLongueur + 2 || Math.abs(large) > 92) return 0;
    return (1 - lisse(Math.abs(long), 2.4, PONT.demiLongueur - 1)) * (1 - lisse(Math.abs(large), 62, 92));
  };

  // Les abords d'un panneau sont aplanis, pour que ses poteaux tombent sur un sol sage.
  const hauteur = (x, z) => {
    const n = sentier.plusProche(x, z);
    const ecart = lisse(n.distance, 2.6, 26);
    let h = n.y + ecart * ((fbm(x * 0.017 + 9, z * 0.017) * 2 - 1) * 15 + fbm(x * 0.09, z * 0.09) * 2.4 + n.distance * 0.1);
    h += lisse(n.distance, 1.6, 3.4) * (fbm(x * 0.4, z * 0.4) - 0.5) * 0.35;
    for (const f of zones.plats) {
      const k = lisse(Math.hypot(x - f.x, z - f.z), f.r, f.r + 7);
      h = mix(f.y, h, k);
    }
    // Le chemin a toujours le dernier mot : rien ne doit le recouvrir, sauf le ravin sous le pont.
    h = mix(n.y - 0.3, h, lisse(n.distance, 1.8, 3.6));
    return mix(h, niveauEau - 0.8, ravine(x, z));
  };

  const ambiance = { uNeige: { value: 0 }, uMouille: { value: 0 }, uVent: { value: 1 } };
  scene.add(creerSol(sentier, hauteur, qualite, ambiance));
  scene.add(creerChemin(sentier, ambiance));
  creerPont(scene, sentier, ambiance);
  const couler = creerRuisseau(scene, sentier, niveauEau, ambiance);

  const formesBase = formes();
  const groupes = { sapin: [], feuillu: [], buisson: [], rocher: [], herbe: [] };

  const libre = (x, z, marge) => zones.interdits.every(s => {
    const abx = s.bx - s.ax, abz = s.bz - s.az;
    const t = THREE.MathUtils.clamp(((x - s.ax) * abx + (z - s.az) * abz) / (abx * abx + abz * abz || 1), 0, 1);
    return Math.hypot(x - s.ax - abx * t, z - s.az - abz * t) > s.r + marge;
  });
  const teintes = {
    sapin: () => ['#44603f', '#4f6a44', '#3a5439', '#587048'][r() * 4 | 0],
    feuillu: u => u < 0.3 ? ['#7c8a45', '#8c8c48', '#6c8040'][r() * 3 | 0] : ['#6a8540', '#7a9048', '#5e7a3e'][r() * 3 | 0],
    buisson: () => ['#667f42', '#74894a', '#5a733e', '#80904e'][r() * 4 | 0],
    rocher: () => ['#6d675e', '#5f5a53', '#787065'][r() * 3 | 0],
    herbe: u => u < 0.15 ? ['#8f9554', '#a09a5c'][r() * 2 | 0] : u > 0.72 ? ['#a79a62', '#94895a'][r() * 2 | 0] : ['#6f8a48', '#7f9650', '#62803f'][r() * 3 | 0],
  };
  const ajouter = (type, x, z, ech, extra = {}) => {
    if (ravine(x, z) > 0.04) return;
    const u = sentier.plusProche(x, z).d / sentier.longueur;
    groupes[type].push({ x, y: hauteur(x, z) - 0.06, z, ech, rot: r() * 6.28, teinte: teintes[type](u), ...extra });
  };

  const densite = u => 0.1 + lisse(u, 0.02, 0.14) * (1 - lisse(u, 0.7, 0.88) * 0.9);
  const volume = qualite.mobile ? 0.55 : 1;
  const semer = (nombre, loinMin, loinMax, marge, choisir) => {
    for (let i = 0; i < nombre * volume; i++) {
      const d = r() * sentier.longueur, p = sentier.point(d), t = sentier.tangente(d);
      const cote = (r() < 0.5 ? -1 : 1) * (loinMin + Math.pow(r(), 1.7) * (loinMax - loinMin));
      const x = p.x - t.z * cote, z = p.z + t.x * cote;
      const n = sentier.plusProche(x, z), u = n.d / sentier.longueur;
      if (n.distance < loinMin || r() > densite(u) * 1.15 || !libre(x, z, marge)) continue;
      choisir(x, z, u);
    }
  };

  semer(4200, 7.5, 100, 1.8, (x, z, u) => {
    const feuillus = 0.55 * (1 - lisse(u, 0.25, 0.62));
    if (r() < feuillus) ajouter('feuillu', x, z, 0.9 + r() * 0.8);
    else ajouter('sapin', x, z, 0.9 + r() * 1.3, { ex: 0.8 + r() * 0.5 });
  });
  semer(2600, 3.8, 40, 1.2, (x, z) => ajouter('buisson', x, z, 0.5 + r() * 0.9));
  semer(500, 2.4, 60, 0.3, (x, z, u) => ajouter('rocher', x, z, 0.2 + r() * (u > 0.7 ? 1.6 : 0.6)));
  for (let i = 0; i < 34000 * volume; i++) {
    const d = r() * sentier.longueur, p = sentier.point(d), t = sentier.tangente(d);
    const cote = (r() < 0.5 ? -1 : 1) * (1.5 + Math.pow(r(), 1.4) * 16);
    const x = p.x - t.z * cote, z = p.z + t.x * cote;
    if (sentier.plusProche(x, z).distance > 1.4) ajouter('herbe', x, z, 0.5 + r() * 0.5);
  }

  // Des pierres longent l'eau : la rive a un bord naturel, sans les marches du maillage du terrain.
  for (const sens of [-1, 1]) {
    for (let large = -56; large <= 56; large += 1.1) {
      let long = 1.5;
      const position = () => [
        pontP.x + pontT.x * sens * long - pontT.z * large,
        pontP.z + pontT.z * sens * long + pontT.x * large,
      ];
      while (long < 7 && hauteur(...position()) < niveauEau + 0.06) long += 0.2;
      const [x, z] = position();
      groupes.rocher.push({ x: x + (r() - 0.5) * 0.5, y: niveauEau + 0.02, z: z + (r() - 0.5) * 0.5, ech: 0.3 + r() * 0.45, rot: r() * 6.28, teinte: teintes.rocher(0.2) });
    }
  }

  // Ce qui cache chaque panneau jusqu'au dernier moment.
  // Jamais trop près du chemin : le rideau cache le panneau, pas le coureur.
  for (const c of zones.caches) {
    if (c.rideau) {
      if (c.arbre) ajouter('feuillu', c.x, c.z, 1.1 + r() * 0.2);
      else ajouter('buisson', c.x, c.z, 1.7 + r() * 0.3);
      continue;
    }
    if (sentier.plusProche(c.x, c.z).distance < (c.large ? 7.5 : 3.6)) continue;
    if (libre(c.x, c.z, c.large ? 2.4 : 1.4)) {
      if (c.large) ajouter(r() < 0.4 ? 'sapin' : 'feuillu', c.x, c.z, 1 + r() * 0.3);
      ajouter('buisson', c.x + (r() - 0.5) * 2, c.z + (r() - 0.5) * 2, c.large ? 1.8 : 1.1 + r() * 0.3);
    }
  }

  const feuilles = peindreFeuilles(hasard(31)), rameau = peindreRameau(hasard(37));
  const matFeuilles = materielVegetal(temps, { map: feuilles, alphaTest: 0.4 }, 0.0016, ambiance, 0.2);
  const matRameau = materielVegetal(temps, { map: rameau, alphaTest: 0.3 }, 0.0012, ambiance, 0.16);
  const matHerbe = materielVegetal(temps, {}, 0.12, ambiance, 0.5);
  const ecorce = new THREE.MeshLambertMaterial({ color: '#4a3d33' });
  const rocheMat = new THREE.MeshLambertMaterial({ color: '#ffffff' });
  const o = qualite.ombres, toutes = [];
  peupler(scene, groupes.sapin, formesBase.sapin, matRameau, o, toutes);
  peupler(scene, groupes.sapin, formesBase.sapinTronc, ecorce, o, toutes, 120);
  peupler(scene, groupes.feuillu, formesBase.feuillu, matFeuilles, o, toutes);
  peupler(scene, groupes.feuillu, formesBase.feuilluTronc, ecorce, o, toutes, 120);
  peupler(scene, groupes.buisson, formesBase.buisson, matFeuilles, o, toutes, 150);
  peupler(scene, groupes.rocher, formesBase.rocher, rocheMat, o, toutes, 150);
  peupler(scene, groupes.herbe, formesBase.herbe, matHerbe, false, toutes, 42);

  const { ciel, uniforms } = creerCiel(scene);
  scene.fog = new THREE.FogExp2('#ffffff', 0.01);
  const hemi = new THREE.HemisphereLight('#ffffff', '#ffffff', 1.5);
  const soleil = new THREE.DirectionalLight('#ffffff', 2.6);
  soleil.castShadow = qualite.ombres;
  soleil.shadow.mapSize.setScalar(qualite.mobile ? 1024 : 2048);
  soleil.shadow.camera.left = -42; soleil.shadow.camera.right = 42;
  soleil.shadow.camera.top = 42; soleil.shadow.camera.bottom = -42;
  soleil.shadow.camera.near = 1; soleil.shadow.camera.far = 240;
  soleil.shadow.bias = -0.0006; soleil.shadow.normalBias = 0.08;
  scene.add(hemi, soleil, soleil.target);

  const dir = V(0, 0, 0), blanc = new THREE.Color('#ffffff');
  const griseHaut = new THREE.Color('#858f99'), griseBas = new THREE.Color('#b4babd');
  const griseNuit = new THREE.Color();
  const placer = (v, az, el) => v.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)).normalize();
  const lumiereDuJour = m => {
    const hauteurSoleil = m.elevation;
    let i = 0;
    while (i < JOURNEE.length - 2 && hauteurSoleil > JOURNEE[i + 1].e) i++;
    const a = JOURNEE[i], b = JOURNEE[i + 1], t = lisse(hauteurSoleil, a.e, b.e);
    uniforms.uHaut.value.lerpColors(a.haut, b.haut, t);
    uniforms.uHorizon.value.lerpColors(a.horizon, b.horizon, t);
    uniforms.uBrume.value.lerpColors(a.brume, b.brume, t);
    uniforms.uSoleil.value.lerpColors(a.soleil, b.soleil, t);
    scene.fog.color.lerpColors(a.brume, b.brume, t);
    scene.fog.density = mix(a.dens, b.dens, t);
    hemi.color.copy(uniforms.uHaut.value).lerp(blanc, 0.45);
    hemi.groundColor.lerpColors(a.ombre, b.ombre, t);
    soleil.color.copy(uniforms.uSoleil.value).lerp(blanc, 0.25);
    // Le soleil laisse la place à la lune quand aucun des deux n'éclaire : la bascule ne se voit pas.
    const lune = hauteurSoleil < -3;
    const az = m.azimut + (lune ? Math.PI : 0);
    const el = THREE.MathUtils.degToRad(lune ? Math.max(32, -hauteurSoleil) : hauteurSoleil);
    placer(uniforms.uDir.value, az, el);
    placer(dir, az, Math.max(el, 0.12));
    const force = lisse(Math.abs(hauteurSoleil + 3), 0, 3);
    uniforms.uAstre.value = force;
    uniforms.uJour.value = m.jour;
    soleil.intensity = mix(a.astre, b.astre, t) * force;
    hemi.intensity = mix(a.ciel, b.ciel, t);

    // Le temps qu'il fait se pose sur l'heure de la course : il voile et assourdit sans l'effacer.
    uniforms.uNuages.value = m.nuages;
    uniforms.uEclair.value = m.eclair;
    const voile = m.nuages * 0.82, sombre = mix(0.08, 1, m.jour);
    uniforms.uHaut.value.lerp(griseNuit.copy(griseHaut).multiplyScalar(sombre), voile);
    griseNuit.copy(griseBas).multiplyScalar(sombre);
    uniforms.uHorizon.value.lerp(griseNuit, voile);
    uniforms.uBrume.value.lerp(griseNuit, voile);
    scene.fog.color.lerp(griseNuit, voile);
    scene.fog.density *= 1 + m.nuages * 0.3 + m.pluie * 1.1 + m.neige * 0.8 + m.brouillard * 6;
    soleil.intensity *= 1 - m.nuages * 0.86;
    hemi.intensity = hemi.intensity * (1 - m.nuages * 0.12 + m.neige * 0.12) + m.eclair * 7;
    hemi.color.lerp(griseNuit.copy(griseBas).multiplyScalar(mix(0.3, 1, m.jour)), voile);
    ambiance.uNeige.value = m.neige;
    ambiance.uMouille.value = m.mouille;
    ambiance.uVent.value = m.vent;
  };

  function mettreAJour(dt, foyer, camera, meteo) {
    temps.value += dt;
    couler(dt);
    lumiereDuJour(meteo);
    ciel.position.copy(camera.position);
    // Au-delà de cette distance, la brume a tout effacé : inutile de dessiner.
    const portee = 2.1 / scene.fog.density;
    for (const p of toutes) {
      p.visible = p.boundingSphere.center.distanceTo(camera.position) - p.boundingSphere.radius < Math.min(portee, p.userData.portee);
    }
    const sx = Math.round(foyer.x / 4) * 4, sz = Math.round(foyer.z / 4) * 4;
    soleil.target.position.set(sx, foyer.y, sz);
    soleil.position.copy(soleil.target.position).addScaledVector(dir, 120);
    soleil.position.y = Math.max(soleil.position.y, foyer.y + 22);
  }

  return { mettreAJour, hauteur };
}

// La poussière levée à chaque appui, et le pollen qui flotte dans la lumière.
export function creerParticules(scene, qualite) {
  const nP = 90, posP = new Float32Array(nP * 3), vie = new Float32Array(nP), vit = new Float32Array(nP * 3);
  const gP = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(posP, 3));
  const c = document.createElement('canvas');
  c.width = c.height = 48;
  const x = c.getContext('2d'), grad = x.createRadialGradient(24, 24, 1, 24, 24, 24);
  grad.addColorStop(0, 'rgba(255,255,255,1)'); grad.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = grad; x.fillRect(0, 0, 48, 48);
  const tex = new THREE.CanvasTexture(c);
  const poussiere = new THREE.Points(gP, new THREE.PointsMaterial({ color: '#b8a488', size: 0.34, map: tex, transparent: true, opacity: 0.22, depthWrite: false }));
  poussiere.frustumCulled = false;
  scene.add(poussiere);
  posP.fill(-9999);

  const nM = qualite.mobile ? 100 : 200, posM = new Float32Array(nM * 3);
  const r = hasard(5);
  for (let i = 0; i < nM * 3; i++) posM[i] = r() * 40 - 20;
  const gM = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(posM, 3));
  const pollen = new THREE.Points(gM, new THREE.PointsMaterial({ color: '#fff3c9', size: 0.05, map: tex, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
  pollen.frustumCulled = false;
  scene.add(pollen);

  let suivant = 0;
  return {
    appui(p) {
      for (let k = 0; k < 7; k++) {
        const i = suivant = (suivant + 1) % nP;
        posP.set([p.x + (Math.random() - 0.5) * 0.3, p.y + 0.12, p.z + (Math.random() - 0.5) * 0.3], i * 3);
        vit.set([(Math.random() - 0.5) * 0.9, 0.35 + Math.random() * 0.5, (Math.random() - 0.5) * 0.9], i * 3);
        vie[i] = 0.7;
      }
    },
    mettreAJour(dt, camera, t) {
      for (let i = 0; i < nP; i++) {
        if (vie[i] <= 0) continue;
        vie[i] -= dt;
        if (vie[i] <= 0) { posP[i * 3 + 1] = -9999; continue; }
        for (let a = 0; a < 3; a++) posP[i * 3 + a] += vit[i * 3 + a] * dt;
      }
      gP.attributes.position.needsUpdate = true;
      // Le pollen entoure toujours la caméra : chaque grain revient de l'autre côté quand il sort du cube.
      for (let i = 0; i < nM; i++) {
        for (let a = 0; a < 3; a++) {
          const centre = camera.position.getComponent(a);
          let v = posM[i * 3 + a] + (a === 1 ? 0.08 : 0.05 * Math.sin(t * 0.4 + i)) * dt;
          v = ((v - centre + 20) % 40 + 40) % 40 - 20 + centre;
          posM[i * 3 + a] = v;
        }
      }
      gM.attributes.position.needsUpdate = true;
    },
  };
}
