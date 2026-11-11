// Loads a user .glb/.gltf and converts it into a holographic wireframe model
// that plugs into the library like the procedural ones.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { CYAN } from './models.js';

function holographize(root) {
  const out = new THREE.Group();
  root.updateMatrixWorld(true);
  root.traverse((o) => {
    if (!o.isMesh || !o.geometry) return;
    const geo = o.geometry.clone(); geo.applyMatrix4(o.matrixWorld);
    const fill = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: CYAN, transparent: true, opacity: 0.05, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    const tris = geo.index ? geo.index.count / 3 : geo.attributes.position.count / 3;
    // dense meshes: edges only above a sharp angle; light meshes: full wireframe
    const lines = tris > 20000
      ? new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }))
      : new THREE.LineSegments(new THREE.WireframeGeometry(geo), new THREE.LineBasicMaterial({ color: CYAN, transparent: true, opacity: tris > 5000 ? 0.18 : 0.4, blending: THREE.AdditiveBlending, depthWrite: false }));
    out.add(fill, lines);
  });
  // normalise: centre at origin, radius 1.1
  const box = new THREE.Box3().setFromObject(out);
  const c = box.getCenter(new THREE.Vector3()), size = box.getSize(new THREE.Vector3()).length() / 2 || 1;
  out.children.forEach((ch) => { ch.geometry.translate(-c.x, -c.y, -c.z); ch.geometry.scale(1.1 / size, 1.1 / size, 1.1 / size); });
  return out;
}

export function createGlbImporter({ scene, library, sound, onLog = () => {} }) {
  const loader = new GLTFLoader();
  let count = 0;
  const input = document.createElement('input'); input.type = 'file'; input.accept = '.glb,.gltf'; input.style.display = 'none'; document.body.appendChild(input);

  async function importFile(file) {
    const url = URL.createObjectURL(file);
    try {
      const gltf = await loader.loadAsync(url);
      const holo = holographize(gltf.scene);
      const id = `glb${++count}`;
      const name = file.name.replace(/\.(glb|gltf)$/i, '').toUpperCase().slice(0, 14) || `IMPORT-${count}`;
      // auto hotspots: a few vertices spread over the surface
      const verts = [];
      holo.traverse((o) => { if (o.isLineSegments) { const a = o.geometry.attributes.position; for (let i = 0; i < a.count; i += Math.max(1, Math.floor(a.count / 400))) verts.push(new THREE.Vector3(a.getX(i), a.getY(i), a.getZ(i))); } });
      const picks = []; for (let i = 0; i < 4 && verts.length; i++) picks.push(verts[Math.floor(((i + 0.5) / 4) * verts.length)]);
      const def = {
        id, name, tag: 'IMPORTED MESH', hotspots: picks.map((v, i) => ({ pos: [v.x, v.y, v.z], title: `COMPONENT ${String.fromCharCode(65 + i)}`, subtitle: 'AUTO-TAGGED VERTEX', level: 40 + i * 15, data: { SOURCE: file.name.slice(0, 18), POS: `${v.x.toFixed(2)}, ${v.y.toFixed(2)}, ${v.z.toFixed(2)}`, STATUS: 'SCANNED' } })),
      };
      scene.registerBuilder(id, () => ({
        group: holo.clone(), radius: 1.25, tiltLimit: 1.2,
        toLocal: (h) => new THREE.Vector3(...h.pos),
        describe: (p) => ({ X: p.x.toFixed(2), Y: p.y.toFixed(2), Z: p.z.toFixed(2) }),
        update() {},
      }));
      scene.defs.push(def); library.addSlot(def); library.select(scene.defs.length - 1);
      sound.confirm(); onLog(`imported ${file.name}`);
    } catch (e) { console.error(e); onLog(`import failed: ${e.message || e}`); sound.close(); }
    finally { URL.revokeObjectURL(url); }
  }
  input.addEventListener('change', () => { if (input.files[0]) importFile(input.files[0]); input.value = ''; });
  window.addEventListener('dragover', (e) => { e.preventDefault(); });
  window.addEventListener('drop', (e) => { e.preventDefault(); const f = [...e.dataTransfer.files].find((x) => /\.(glb|gltf)$/i.test(x.name)); if (f) importFile(f); });
  return { open: () => input.click(), importFile };
}
