// Le coureur : un humain Microsoft Rocketbox, animé par ses propres mouvements capturés.
import * as THREE from 'three';
import { GLTFLoader } from '../vendor/GLTFLoader.js';

// Mètres réellement parcourus par cycle complet (deux appuis) dans les mouvements capturés.
const FOULEE_COURSE = 2.36, FOULEE_MARCHE = 1.5;
const CADENCE_MAX = 1.7; // cycles par seconde : au-delà, la foulée s'allonge au lieu de s'emballer
const TAILLE = 1.78; // mètres

// Oriente un os vers une direction du monde, en gardant le reste du corps tel que l'animation l'a posé.
const pa = new THREE.Vector3(), pb = new THREE.Vector3(), actuel = new THREE.Vector3();
const delta = new THREE.Quaternion(), qMonde = new THREE.Quaternion(), qParent = new THREE.Quaternion();
function pointer(os, bout, direction, force) {
  os.updateWorldMatrix(true, false);
  bout.updateWorldMatrix(false, false);
  os.getWorldPosition(pa);
  bout.getWorldPosition(pb);
  actuel.copy(pb).sub(pa).normalize();
  delta.setFromUnitVectors(actuel, direction);
  os.getWorldQuaternion(qMonde).premultiply(delta);
  os.parent.getWorldQuaternion(qParent).invert();
  os.quaternion.slerp(qParent.multiply(qMonde), force);
}

// Tourne un os autour de la verticale du monde, quels que soient ses axes propres.
const VERTICALE = new THREE.Vector3(0, 1, 0);
function tourner(os, angle) {
  os.getWorldQuaternion(qMonde);
  delta.setFromAxisAngle(VERTICALE, angle);
  os.parent.getWorldQuaternion(qParent).invert();
  os.quaternion.copy(qParent.multiply(delta).multiply(qMonde));
}

// Une ombre douce sous les pieds : c'est elle qui pose le personnage au sol, même loin du soleil.
function ombreDeContact() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d'), d = x.createRadialGradient(32, 32, 2, 32, 32, 32);
  d.addColorStop(0, 'rgba(16,14,10,.62)');
  d.addColorStop(0.5, 'rgba(16,14,10,.3)');
  d.addColorStop(1, 'rgba(16,14,10,0)');
  x.fillStyle = d;
  x.fillRect(0, 0, 64, 64);
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(1.1, 1.1).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, fog: false, toneMapped: false }),
  );
  m.position.y = 0.09;
  m.renderOrder = 1;
  return m;
}

// Les captures avancent pour de bon : le bassin parcourt la foulée, puis reviendrait d'un coup au début
// de la boucle. On retire cette avancée régulière : c'est le sentier qui fait progresser le coureur.
function surPlace(clip) {
  const piste = clip.tracks.find(t => t.name === 'Bip01_Pelvis.position');
  const v = piste.values, n = v.length / 3;
  const debut = v[0], fin = v[(n - 1) * 3];
  for (let i = 0; i < n; i++) v[i * 3] -= debut + (fin - debut) * i / (n - 1);
  return clip;
}

export function creerCoureur() {
  const racine = new THREE.Group();
  let mixeur = null, course, marche, repos, squelette;
  racine.add(ombreDeContact());

  // La frontale : allumée en permanence pour le moteur, seule son intensité suit la nuit.
  const frontale = new THREE.SpotLight('#fff1d6', 0, 34, 0.62, 0.75, 1.5);
  frontale.position.set(0, 1.66, 0.2);
  frontale.target.position.set(0, 0, 8);
  racine.add(frontale, frontale.target);
  // Le faisceau part vers l'avant : une lueur douce, toujours du côté de la caméra, garde le coureur lisible.
  const lueur = new THREE.PointLight('#c8d4ea', 0, 8, 1.4);
  racine.add(lueur);

  new GLTFLoader().load('assets/coureur.glb', gltf => {
    gltf.scene.traverse(o => {
      if (!o.isSkinnedMesh) return;
      o.castShadow = true;
      o.frustumCulled = false;
    });
    const os = n => gltf.scene.getObjectByName(`Bip01_${n}`);
    squelette = {
      tete: os('Head'),
      bras: [[-1, 'R'], [1, 'L']].map(([c, n]) => ({
        c, clavicule: os(`${n}_Clavicle`), epaule: os(`${n}_UpperArm`), coude: os(`${n}_Forearm`), main: os(`${n}_Hand`),
        majeur: os(`${n}_Finger2`),
        doigts: ['1', '2', '3', '4'].flatMap(f => [`Finger${f}`, `Finger${f}1`, `Finger${f}2`]).map(d => os(`${n}_${d}`)),
      })),
    };

    mixeur = new THREE.AnimationMixer(gltf.scene);
    const action = nom => {
      const a = mixeur.clipAction(surPlace(THREE.AnimationClip.findByName(gltf.animations, nom)));
      a.play();
      return a;
    };
    course = action('run');
    marche = action('walk');
    repos = action('idle');
    // La foulée suit la distance parcourue, et non l'horloge : les pieds ne glissent jamais.
    course.paused = marche.paused = true;

    mixeur.update(0);
    gltf.scene.updateMatrixWorld(true);
    // Mesuré avant d'être posé sur le sentier : la hauteur de la tête ne doit pas compter l'altitude du sol,
    // sinon un coureur qui démarre loin du départ (retour du format téléphone) sortirait minuscule.
    gltf.scene.scale.setScalar(TAILLE / os('Head').getWorldPosition(new THREE.Vector3()).y * 0.92);
    racine.add(gltf.scene);
  });

  let cycleCourse = 0, cycleMarche = 0, derniere = null, cap = null;
  const leve = new THREE.Vector3();

  // distance : position sur le sentier ; vitesse : m/s signée ; victoire : 0 à 1 ; regard : radians ;
  // pietine : 0 à 1, petits pas sur place, le temps de se retourner.
  function animer(dt, temps, distance, vitesse, victoire, regard, pietine) {
    if (derniere === null) derniere = distance;
    const pas = Math.abs(distance - derniere);
    derniere = distance;
    const allure = Math.abs(vitesse);
    const avant = cycleCourse;
    cycleCourse += pas / Math.max(FOULEE_COURSE, allure / CADENCE_MAX);
    cycleMarche += pas / FOULEE_MARCHE + dt * pietine * 0.9;
    const appui = Math.floor(avant * 2) !== Math.floor(cycleCourse * 2) && allure > 1;
    if (!mixeur) return appui;

    const enCourse = THREE.MathUtils.smoothstep(allure, 1.2, 2.6);
    const enMarche = Math.max(THREE.MathUtils.smoothstep(allure, 0.1, 0.9), pietine * 0.7) * (1 - enCourse);
    course.time = (cycleCourse % 1) * course.getClip().duration;
    marche.time = (cycleMarche % 1) * marche.getClip().duration;
    course.setEffectiveWeight(enCourse);
    marche.setEffectiveWeight(enMarche);
    repos.setEffectiveWeight(1 - enCourse - enMarche);
    mixeur.update(dt);

    if (regard) tourner(squelette.tete, regard * (1 - enCourse * 0.5));

    if (victoire > 0.001) {
      for (const b of squelette.bras) {
        // Une pose de victoire : l'épaule monte avec le bras, le coude reste plié, le poing se ferme.
        leve.set(b.c * 0.9, 0.42, 0.04).normalize().applyQuaternion(racine.quaternion);
        pointer(b.clavicule, b.epaule, leve, victoire);
        leve.set(b.c * 0.62, 0.78, 0.12).normalize().applyQuaternion(racine.quaternion);
        pointer(b.epaule, b.coude, leve, victoire);
        leve.set(b.c * 0.1, 1, 0.22).normalize().applyQuaternion(racine.quaternion);
        pointer(b.coude, b.main, leve, victoire);
        pointer(b.main, b.majeur, leve, victoire);
        for (const d of b.doigts) d.rotateZ(1.25 * victoire);
      }
    }
    return appui;
  }

  function orienter(dt, angle) {
    if (cap === null) cap = angle;
    let ecart = (angle - cap) % (Math.PI * 2);
    if (ecart > Math.PI) ecart -= Math.PI * 2;
    if (ecart < -Math.PI) ecart += Math.PI * 2;
    cap += ecart * (1 - Math.exp(-dt * 9));
    racine.rotation.y = cap;
  }

  function eclairer(nuit, camera) {
    frontale.intensity = nuit * 42;
    lueur.intensity = nuit * 9;
    racine.worldToLocal(lueur.position.copy(camera.position)).setY(0).setLength(2.4).setY(2.2);
  }

  return { racine, animer, orienter, eclairer };
}
