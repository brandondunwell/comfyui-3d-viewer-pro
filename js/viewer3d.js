/**
 * viewer3d.js — ComfyUI 3D Viewer Pro Extension
 * 
 * SINGLE-FILE, SELF-CONTAINED extension.
 * All viewer code is inline — no fragile import chains.
 * Three.js and loaders are loaded dynamically with error handling.
 */
import { app } from "../../scripts/app.js";
import { api } from "../../scripts/api.js";

// ═══════════════════════════════════════════════════════════════════════════
//  CSS — injected inline to avoid file-serving issues
// ═══════════════════════════════════════════════════════════════════════════
const VIEWER_CSS = `
.v3d-container {
    position: relative;
    width: 100%;
    background: #0d1117;
    border-radius: 6px;
    overflow: hidden;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
    border: 1px solid rgba(48,54,61,0.6);
}
.v3d-canvas-wrap {
    position: relative;
    width: 100%;
    cursor: grab;
    background: #1a1a2e;
}
.v3d-canvas-wrap:active { cursor: grabbing; }
.v3d-canvas-wrap canvas { display: block; width: 100% !important; height: 100% !important; }
.v3d-toolbar {
    position: absolute; top: 10px; left: 10px; right: 10px; z-index: 10;
    display: flex; align-items: center; gap: 8px; padding: 6px 12px;
    background: rgba(13,17,23,0.75); backdrop-filter: blur(8px);
    border: 1px solid rgba(88,166,255,0.15); border-radius: 8px;
    flex-wrap: wrap; pointer-events: auto;
    box-shadow: 0 4px 12px rgba(0,0,0,0.3);
}
.v3d-toolbar-group {
    display: flex; align-items: center; gap: 4px;
    background: rgba(255,255,255,0.03); padding: 4px 8px;
    border-radius: 6px; border: 1px solid rgba(255,255,255,0.05);
}
.v3d-toolbar label, .v3d-toolbar span {
    font-size: 10px; font-weight: 600; color: #c9d1d9;
    user-select: none; margin: 0;
}
.v3d-toolbar select {
    appearance: none; background: #21262d; border: 1px solid rgba(139,148,158,0.3);
    border-radius: 6px; color: #e6edf3; font-size: 11px; padding: 4px 20px 4px 8px;
    cursor: pointer; outline: none; transition: border 0.2s ease;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath fill='%238b949e' d='M2.5 3.5l2.5 2.5 2.5-2.5'/%3E%3C/svg%3E");
    background-repeat: no-repeat; background-position: right 6px center;
}
.v3d-toolbar select:hover { border-color: #58a6ff; }
.v3d-toolbar button {
    background: #21262d; border: 1px solid rgba(139,148,158,0.3); border-radius: 6px;
    color: #e6edf3; font-size: 13px; width: 28px; height: 26px; cursor: pointer;
    display: inline-flex; align-items: center; justify-content: center; padding: 0;
    transition: all 0.15s ease;
}
.v3d-toolbar button:hover {
    background: #58a6ff; border-color: #58a6ff; color: #0d1117;
    transform: translateY(-1px); box-shadow: 0 2px 5px rgba(88,166,255,0.3);
}
.v3d-toolbar .v3d-spacer { flex: 1; }
.v3d-status {
    position: absolute; bottom: 10px; left: 10px; right: 10px; z-index: 10;
    display: flex; gap: 10px; padding: 4px 10px;
    background: rgba(13,17,23,0.7); backdrop-filter: blur(4px);
    border: 1px solid rgba(48,54,61,0.5); border-radius: 6px;
    font-size: 10px; color: #8b949e;
    font-family: 'SF Mono','Cascadia Code',monospace; user-select: none; pointer-events: none;
}
.v3d-status .v3d-fps { margin-left: auto; color: #3fb950; }
.v3d-loading {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(13,17,23,0.92); backdrop-filter: blur(8px); z-index: 50;
    flex-direction: column; gap: 10px; color: #e6edf3; font-size: 12px;
}
.v3d-spinner {
    width: 28px; height: 28px; border: 3px solid #21262d;
    border-top-color: #58a6ff; border-radius: 50%;
    animation: v3dspin 0.7s linear infinite;
}
@keyframes v3dspin { to { transform: rotate(360deg); } }
.v3d-error {
    position: absolute; top: 0; left: 0; right: 0; bottom: 0;
    display: flex; align-items: center; justify-content: center;
    background: rgba(13,17,23,0.95); color: #f85149; font-size: 11px;
    padding: 20px; text-align: center; flex-direction: column; gap: 8px;
}
`;

function injectCSS() {
    if (document.getElementById('v3d-pro-css')) return;
    const style = document.createElement('style');
    style.id = 'v3d-pro-css';
    style.textContent = VIEWER_CSS;
    document.head.appendChild(style);
}

// ═══════════════════════════════════════════════════════════════════════════
//  THREE.JS LOADER — dynamic import with fallback
// ═══════════════════════════════════════════════════════════════════════════
let THREE = null;
let OrbitControls = null;
let GLTFLoader = null;
let OBJLoader = null;
let STLLoader = null;
let FBXLoader = null;
let TransformControls = null;
let threeReady = false;
let threeError = null;

// Resolve the base path for our extension's files
function getExtensionPath() {
    // The current script URL tells us where our extension lives
    try {
        const url = new URL(import.meta.url);
        return url.pathname.substring(0, url.pathname.lastIndexOf('/'));
    } catch {
        // Fallback: find our extension by searching for it
        const scripts = document.querySelectorAll('script[src*="viewer3d"]');
        if (scripts.length > 0) {
            const src = scripts[0].src;
            return src.substring(0, src.lastIndexOf('/'));
        }
        return '/extensions/comfyui-3d-viewer-pro';
    }
}

async function loadThreeJS() {
    if (threeReady) return true;
    if (threeError) return false;

    const basePath = getExtensionPath();
    try {
        console.log('[3D Viewer Pro] Loading Three.js from:', basePath);

        THREE = await import(`${basePath}/lib/three.module.min.js`);
        console.log('[3D Viewer Pro] Three.js core loaded');

        const orbitMod = await import(`${basePath}/lib/OrbitControls.js`);
        OrbitControls = orbitMod.OrbitControls;
        console.log('[3D Viewer Pro] OrbitControls loaded');

        const gltfMod = await import(`${basePath}/lib/GLTFLoader.js`);
        GLTFLoader = gltfMod.GLTFLoader;
        console.log('[3D Viewer Pro] GLTFLoader loaded');

        try {
            const objMod = await import(`${basePath}/lib/OBJLoader.js`);
            OBJLoader = objMod.OBJLoader;
            console.log('[3D Viewer Pro] OBJLoader loaded');
        } catch (e) { console.warn('[3D Viewer Pro] OBJLoader failed:', e.message); }

        try {
            const stlMod = await import(`${basePath}/lib/STLLoader.js`);
            STLLoader = stlMod.STLLoader;
            console.log('[3D Viewer Pro] STLLoader loaded');
        } catch (e) { console.warn('[3D Viewer Pro] STLLoader failed:', e.message); }

        try {
            const fbxMod = await import(`${basePath}/lib/FBXLoader.js`);
            FBXLoader = fbxMod.FBXLoader;
            console.log('[3D Viewer Pro] FBXLoader loaded');
        } catch (e) { console.warn('[3D Viewer Pro] FBXLoader failed:', e.message); }

        try {
            const tcMod = await import(`${basePath}/lib/TransformControls.js`);
            TransformControls = tcMod.TransformControls;
            console.log('[3D Viewer Pro] TransformControls loaded');
        } catch (e) { console.warn('[3D Viewer Pro] TransformControls failed:', e.message); }

        threeReady = true;
        console.log('[3D Viewer Pro] All libraries loaded successfully');
        return true;
    } catch (err) {
        threeError = err;
        console.error('[3D Viewer Pro] Failed to load Three.js:', err);
        return false;
    }
}

// ═══════════════════════════════════════════════════════════════════════════
//  3D VIEWER CLASS — self-contained viewer
// ═══════════════════════════════════════════════════════════════════════════
class Viewer3D {
    constructor(container, width, height) {
        this.container = container;
        this.width = width;
        this.height = height;
        this.model = null;
        this.scene = null;
        this.camera = null;
        this.renderer = null;
        this.controls = null;
        this.mixer = null;
        this.clock = null;
        this.lights = [];
        this.gridHelper = null;
        this.axesHelper = null;
        this.animId = null;
        this.showGrid = true;
        this.showAxes = true;
        this.renderMode = 'color';
        this.savedMaterials = new Map();
        this.transformControls = null;
        this.modelInfo = null;
        this.fpsFrames = 0;
        this.fpsTime = performance.now();
        this.fps = 0;
    }

    async init() {
        if (!THREE) return false;

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: true,
            alpha: true,
            preserveDrawingBuffer: true,
        });
        this.renderer.setSize(this.width, this.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color('#1a1a2e');

        // Camera
        this.camera = new THREE.PerspectiveCamera(50, this.width / this.height, 0.01, 1000);
        this.camera.position.set(2.5, 1.8, 2.5);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.rotateSpeed = 0.8;
        this.controls.enablePan = true;
        this.controls.screenSpacePanning = true;

        // Transform Gizmo
        if (TransformControls) {
            this.transformControls = new TransformControls(this.camera, this.renderer.domElement);
            this.transformControls.addEventListener('dragging-changed', (event) => {
                this.controls.enabled = !event.value;
            });
            this.scene.add(this.transformControls.getHelper());
        }

        // Clock for animations
        this.clock = new THREE.Clock();

        // Setup scene
        this._setupGrid();
        this._setupAxes();
        this._setupLighting('studio');
        this._setupGroundPlane();

        // Add canvas
        this.canvasWrap = this.container.querySelector('.v3d-canvas-wrap');
        if (this.canvasWrap) {
            this.canvasWrap.appendChild(this.renderer.domElement);
        }

        // Start render loop
        this._animate();
        return true;
    }

    _setupGrid() {
        if (this.gridHelper) this.scene.remove(this.gridHelper);
        if (!this.showGrid) return;
        this.gridHelper = new THREE.GridHelper(10, 20, 0x444466, 0x333355);
        this.gridHelper.material.opacity = 0.3;
        this.gridHelper.material.transparent = true;
        this.gridHelper.material.depthWrite = false;
        this.scene.add(this.gridHelper);
    }

    _setupAxes() {
        if (this.axesHelper) this.scene.remove(this.axesHelper);
        if (!this.showAxes) return;
        this.axesHelper = new THREE.AxesHelper(1.5);
        this.axesHelper.material.depthTest = false;
        this.axesHelper.renderOrder = 999;
        this.scene.add(this.axesHelper);
    }

    _setupGroundPlane() {
        const geo = new THREE.PlaneGeometry(20, 20);
        const mat = new THREE.ShadowMaterial({ opacity: 0.25 });
        const plane = new THREE.Mesh(geo, mat);
        plane.rotation.x = -Math.PI / 2;
        plane.position.y = -0.001;
        plane.receiveShadow = true;
        this.scene.add(plane);
    }

    _setupLighting(preset) {
        // Remove old lights
        this.lights.forEach(l => { this.scene.remove(l); if (l.dispose) l.dispose(); });
        this.lights = [];

        const addLight = (light) => { this.scene.add(light); this.lights.push(light); };

        switch (preset) {
            case 'studio':
                addLight(new THREE.AmbientLight(0x404060, 0.4));
                const key = new THREE.DirectionalLight(0xfff0e0, 1.2);
                key.position.set(3, 5, 4);
                key.castShadow = true;
                key.shadow.mapSize.set(2048, 2048);
                key.shadow.camera.near = 0.1; key.shadow.camera.far = 30;
                key.shadow.camera.left = -5; key.shadow.camera.right = 5;
                key.shadow.camera.top = 5; key.shadow.camera.bottom = -5;
                key.shadow.bias = -0.0005;
                addLight(key);
                const fill = new THREE.DirectionalLight(0xc0d0ff, 0.5);
                fill.position.set(-3, 2, 2);
                addLight(fill);
                const rim = new THREE.DirectionalLight(0xffffff, 0.3);
                rim.position.set(0, 3, -4);
                addLight(rim);
                addLight(new THREE.HemisphereLight(0x8899bb, 0x445566, 0.3));
                break;
            case 'outdoor':
                addLight(new THREE.AmbientLight(0x6688cc, 0.3));
                const sun = new THREE.DirectionalLight(0xffeedd, 1.5);
                sun.position.set(5, 8, 3); sun.castShadow = true;
                sun.shadow.mapSize.set(2048, 2048);
                addLight(sun);
                addLight(new THREE.HemisphereLight(0x87ceeb, 0x362d1b, 0.6));
                break;
            case 'dramatic':
                addLight(new THREE.AmbientLight(0x111122, 0.15));
                const spot = new THREE.SpotLight(0xff9944, 2.0, 20, Math.PI/6, 0.5, 1);
                spot.position.set(4, 4, 2); spot.castShadow = true;
                addLight(spot);
                const dRim = new THREE.DirectionalLight(0x4466ff, 0.8);
                dRim.position.set(-3, 2, -3);
                addLight(dRim);
                break;
            case 'flat':
                addLight(new THREE.AmbientLight(0xffffff, 0.8));
                addLight(new THREE.HemisphereLight(0xffffff, 0xcccccc, 0.5));
                const front = new THREE.DirectionalLight(0xffffff, 0.3);
                front.position.set(0, 2, 5);
                addLight(front);
                break;
            case 'rim':
                addLight(new THREE.AmbientLight(0x111133, 0.2));
                [[0xff6644,-3,3,-3],[0x4488ff,3,3,-3],[0x44ff88,0,4,-2]].forEach(([c,x,y,z]) => {
                    const l = new THREE.DirectionalLight(c, 0.9);
                    l.position.set(x,y,z); addLight(l);
                });
                const fRim = new THREE.DirectionalLight(0x333344, 0.3);
                fRim.position.set(0, 1, 4); addLight(fRim);
                break;
        }
    }

    async loadModel(url, format, settings = {}) {
        // Remove previous model
        if (this.model) {
            this.scene.remove(this.model);
            this.model.traverse(child => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => { m.map?.dispose(); m.dispose(); });
                }
            });
            this.model = null;
        }
        if (this.mixer) { this.mixer.stopAllAction(); this.mixer = null; }

        let loaded;
        format = format.toLowerCase();

        if ((format === 'glb' || format === 'gltf') && GLTFLoader) {
            const loader = new GLTFLoader();
            loaded = await new Promise((resolve, reject) => {
                loader.load(url, gltf => resolve({ model: gltf.scene, animations: gltf.animations }),
                    undefined, reject);
            });
        } else if (format === 'obj' && OBJLoader) {
            const loader = new OBJLoader();
            loaded = await new Promise((resolve, reject) => {
                loader.load(url, obj => {
                    obj.traverse(c => {
                        if (c.isMesh && (!c.material || c.material.type === 'MeshBasicMaterial')) {
                            c.material = new THREE.MeshStandardMaterial({ color: 0x888888, roughness: 0.5 });
                        }
                    });
                    resolve({ model: obj, animations: [] });
                }, undefined, reject);
            });
        } else if (format === 'stl' && STLLoader) {
            const loader = new STLLoader();
            loaded = await new Promise((resolve, reject) => {
                loader.load(url, geo => {
                    geo.computeVertexNormals();
                    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: 0x7799bb, roughness: 0.4 }));
                    mesh.castShadow = true; mesh.receiveShadow = true;
                    const group = new THREE.Group(); group.add(mesh);
                    resolve({ model: group, animations: [] });
                }, undefined, reject);
            });
        } else if (format === 'fbx' && FBXLoader) {
            const loader = new FBXLoader();
            loaded = await new Promise((resolve, reject) => {
                loader.load(url, fbx => resolve({ model: fbx, animations: fbx.animations || [] }),
                    undefined, reject);
            });
        } else {
            throw new Error(`Format '${format}' not supported or loader not available`);
        }

        this.model = loaded.model;

        // Enable shadows on all meshes
        this.model.traverse(c => { if (c.isMesh) { c.castShadow = true; c.receiveShadow = true; }});

        // Apply up direction
        const up = settings.up_direction || 'Y';
        if (up === 'Z') this.model.rotation.x = -Math.PI / 2;
        else if (up === '-Y') this.model.rotation.z = Math.PI;
        else if (up === '-Z') this.model.rotation.x = Math.PI / 2;
        this.model.updateMatrixWorld(true);

        // Auto-scale
        const box = new THREE.Box3().setFromObject(this.model);
        const size = new THREE.Vector3(); box.getSize(size);
        const center = new THREE.Vector3(); box.getCenter(center);

        if (settings.auto_scale !== false) {
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) this.model.scale.multiplyScalar(2.0 / maxDim);
        }
        if (settings.scale && settings.scale !== 1.0) {
            this.model.scale.multiplyScalar(settings.scale);
        }

        // Center dynamically by bounding box offset translation
        if (settings.center_model !== false) {
            this.model.updateMatrixWorld(true);
            const box2 = new THREE.Box3().setFromObject(this.model);
            const center2 = new THREE.Vector3(); box2.getCenter(center2);
            this.model.position.sub(center2);
            
            // Wrap in an origin group to protect hierarchical transforms
            const wrapperGroup = new THREE.Group();
            wrapperGroup.add(this.model);
            this.model = wrapperGroup;
        }

        this.scene.add(this.model);

        if (this.transformControls) {
            this.transformControls.detach();
            this.transformControls.enabled = false;
        }

        // Fit camera
        this._zoomToFit();

        // Setup animations
        if (loaded.animations && loaded.animations.length > 0) {
            this.mixer = new THREE.AnimationMixer(this.model);
            const action = this.mixer.clipAction(loaded.animations[0]);
            action.play();
        }

        // Extract info
        this._extractModelInfo();

        return loaded;
    }

    _zoomToFit() {
        if (!this.model) return;
        const box = new THREE.Box3().setFromObject(this.model);
        const center = new THREE.Vector3(); box.getCenter(center);
        const size = new THREE.Vector3(); box.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        const dist = (maxDim / 2) / Math.tan(fov / 2) * 1.4;

        this.controls.target.copy(center);
        this.camera.position.set(
            center.x + dist * 0.5,
            center.y + dist * 0.4,
            center.z + dist * 0.7
        );
        this.camera.lookAt(center);
        this.controls.update();
    }

    _extractModelInfo() {
        if (!this.model) { this.modelInfo = null; return; }
        let verts = 0, faces = 0, meshes = 0;
        this.model.traverse(c => {
            if (c.isMesh) {
                meshes++;
                const g = c.geometry;
                if (g) {
                    verts += g.attributes.position ? g.attributes.position.count : 0;
                    faces += g.index ? g.index.count / 3 : (g.attributes.position ? g.attributes.position.count / 3 : 0);
                }
            }
        });
        const box = new THREE.Box3().setFromObject(this.model);
        const s = new THREE.Vector3(); box.getSize(s);
        this.modelInfo = { verts, faces: Math.round(faces), meshes,
            dims: `${s.x.toFixed(2)}×${s.y.toFixed(2)}×${s.z.toFixed(2)}` };
    }

    setRenderMode(mode) {
        // Restore originals first
        this._restoreMaterials();
        this.renderMode = mode;
        if (mode === 'color' || !this.model) return;

        this._saveMaterials();
        let mat;
        switch (mode) {
            case 'wireframe':
                mat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, wireframe: true });
                break;
            case 'normal':
                mat = new THREE.MeshNormalMaterial();
                break;
            case 'depth':
                mat = new THREE.ShaderMaterial({
                    vertexShader: `varying float vD; void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vD=-mv.z;gl_Position=projectionMatrix*mv;}`,
                    fragmentShader: `varying float vD;void main(){float d=clamp(1.0-(vD-0.1)/(20.0-0.1),0.0,1.0);gl_FragColor=vec4(vec3(d),1.0);}`,
                });
                break;
            case 'matcap':
                mat = new THREE.ShaderMaterial({
                    vertexShader: `varying vec3 vN,vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
                    fragmentShader: `varying vec3 vN,vV;void main(){vec3 n=normalize(vN);vec3 v=normalize(vV);float f=pow(1.0-max(dot(n,v),0.0),2.0);vec3 w=vec3(0.85,0.75,0.65),c=vec3(0.3,0.35,0.5);vec3 col=mix(w,c,f);float d=max(dot(n,normalize(vec3(0.5,1.0,0.3))),0.0);col*=0.5+0.5*d;gl_FragColor=vec4(col,1.0);}`,
                });
                break;
            case 'ao':
                mat = new THREE.ShaderMaterial({
                    vertexShader: `varying vec3 vN,vP;void main(){vN=normalize(normalMatrix*normal);vP=(modelViewMatrix*vec4(position,1.0)).xyz;gl_Position=projectionMatrix*vec4(vP,1.0);}`,
                    fragmentShader: `varying vec3 vN,vP;void main(){vec3 n=normalize(vN);float ao=0.5+0.5*n.y;float e=1.0-abs(dot(n,normalize(-vP)));ao*=1.0-0.3*e;gl_FragColor=vec4(vec3(ao),1.0);}`,
                });
                break;
            case 'uv':
                mat = new THREE.ShaderMaterial({
                    vertexShader: `varying vec2 vU;void main(){vU=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
                    fragmentShader: `varying vec2 vU;void main(){gl_FragColor=vec4(vU.x,vU.y,0.0,1.0);}`,
                });
                break;
            case 'silhouette':
                mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
                break;
            case 'mask':
                mat = new THREE.MeshBasicMaterial({ color: 0x000000 });
                break;
        }
        if (mat) {
            this.model.traverse(c => { if (c.isMesh) c.material = mat; });
        }
    }

    _saveMaterials() {
        this.savedMaterials.clear();
        if (this.model) {
            this.model.traverse(c => { if (c.isMesh) this.savedMaterials.set(c.uuid, c.material); });
        }
    }

    _restoreMaterials() {
        if (this.savedMaterials.size === 0) return;
        if (this.model) {
            this.model.traverse(c => {
                if (c.isMesh && this.savedMaterials.has(c.uuid)) c.material = this.savedMaterials.get(c.uuid);
            });
        }
        this.savedMaterials.clear();
    }

    setCameraPreset(name) {
        if (!this.model) return;
        const box = new THREE.Box3().setFromObject(this.model);
        const center = new THREE.Vector3(); box.getCenter(center);
        const size = new THREE.Vector3(); box.getSize(size);
        const d = Math.max(size.x, size.y, size.z) * 2.0;
        this.controls.target.copy(center);
        const p = {
            front: [center.x,center.y,center.z+d], back: [center.x,center.y,center.z-d],
            left: [center.x-d,center.y,center.z], right: [center.x+d,center.y,center.z],
            top: [center.x,center.y+d,center.z+0.001], bottom: [center.x,center.y-d,center.z+0.001],
            isometric: [center.x+d*0.577,center.y+d*0.577,center.z+d*0.577],
            three_quarter: [center.x+d*0.5,center.y+d*0.35,center.z+d*0.75],
        }[name];
        if (p) { this.camera.position.set(...p); this.camera.lookAt(center); this.controls.update(); }
    }

    setBackground(color) { if (this.scene) this.scene.background = new THREE.Color(color); }

    resize(w, h) {
        this.width = w; this.height = h;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    captureScreenshot() {
        this.renderer.render(this.scene, this.camera);
        const url = this.renderer.domElement.toDataURL('image/png');
        const a = document.createElement('a');
        a.download = `3dviewer_${Date.now()}.png`;
        a.href = url; a.click();
    }

    _animate() {
        this.animId = requestAnimationFrame(() => this._animate());
        if (this.mixer) this.mixer.update(this.clock.getDelta());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);

        // FPS
        this.fpsFrames++;
        const now = performance.now();
        if (now - this.fpsTime >= 1000) {
            this.fps = Math.round(this.fpsFrames * 1000 / (now - this.fpsTime));
            this.fpsFrames = 0;
            this.fpsTime = now;
        }
    }

    dispose() {
        if (this.animId) cancelAnimationFrame(this.animId);
        this.controls?.dispose();
        this.renderer?.dispose();
    }
}


// ═══════════════════════════════════════════════════════════════════════════
//  COMFYUI EXTENSION — node interception and widget creation
// ═══════════════════════════════════════════════════════════════════════════
const viewerInstances = new Map(); // nodeId -> Viewer3D

app.registerExtension({
    name: "comfy.viewer3dpro",

    async setup() {
        injectCSS();
        console.log('[3D Viewer Pro] Extension setup complete');
    },

    async beforeRegisterNodeDef(nodeType, nodeData, _app) {

        // ════════════════════════════════════════════════════════════
        //  LoadAndPreview3DModelPro — inject upload button & viewer
        // ════════════════════════════════════════════════════════════
        if (nodeData.name === "LoadAndPreview3DModelPro") {
            const origCreated = nodeType.prototype.onNodeCreated;
            nodeType.prototype.onNodeCreated = function() {
                if (origCreated) origCreated.apply(this, arguments);

                const node = this;
                
                // 1. Add Upload Button
                this.addWidget("button", "📂 Upload 3D Model", null, () => {
                    const inp = document.createElement('input');
                    inp.type = 'file';
                    inp.accept = '.glb,.gltf,.obj,.stl,.fbx';
                    inp.onchange = async (e) => {
                        const file = e.target.files[0];
                        if (!file) return;
                        const fd = new FormData();
                        fd.append('file', file);
                        try {
                            const resp = await fetch('/viewer3d/upload', { method: 'POST', body: fd });
                            const result = await resp.json();
                            if (result.status === 'ok') {
                                // Dynamically update the model dropdown list
                                const modelWidget = node.widgets.find(w => w.name === "model_file");
                                if (modelWidget) {
                                    if (!modelWidget.options.values.includes(result.filename)) {
                                        modelWidget.options.values.push(result.filename);
                                    }
                                    modelWidget.value = result.filename;
                                    if (modelWidget.callback) modelWidget.callback(result.filename);
                                }
                                alert(`✅ Uploaded: ${result.filename}\nIt has been automatically loaded!`);
                            } else {
                                alert(`❌ Upload failed: ${result.message}`);
                            }
                        } catch (err) {
                            alert(`❌ Error: ${err.message}`);
                        }
                    };
                    inp.click();
                });

                // 2. Add Viewer DOM widget
                createViewerWidget(this);
            };

            const origExecuted = nodeType.prototype.onExecuted;
            nodeType.prototype.onExecuted = function(output) {
                if (origExecuted) origExecuted.apply(this, arguments);
                if (output?.viewer_data?.[0]) {
                    handleViewerOutput(this, output.viewer_data[0]);
                }
            };
        }
    }
});


// ═══════════════════════════════════════════════════════════════════════════
//  Widget creation and model loading
// ═══════════════════════════════════════════════════════════════════════════
function createViewerWidget(node) {
    const container = document.createElement('div');
    container.className = 'v3d-container';

    // Build HTML structure
    container.innerHTML = `
        <div class="v3d-toolbar">
            <div class="v3d-toolbar-group">
                <button data-action="bg" title="Upload Background Image">🖼️ BG</button>
                <button data-action="clear-bg" title="Remove Background" style="color:#f85149;">✕</button>
            </div>
            
            <div class="v3d-toolbar-group" title="Field of View (Lens mm)">
                <span>🎥</span>
                <span data-id="fov-val" style="width:20px;text-align:right;">50</span>
                <input type="range" data-action="fov" min="10" max="150" value="50" style="width:40px;margin-left:5px;">
            </div>

            <select data-action="mode" title="Render Material Pass">
                <option value="color">Color</option>
                <option value="wireframe">Wireframe</option>
                <option value="normal">Normal</option>
                <option value="depth">Depth</option>
                <option value="matcap">Matcap</option>
                <option value="ao">AO</option>
                <option value="uv">UV</option>
                <option value="silhouette">Silhouette</option>
            </select>

            <select data-action="camera" title="Camera Perspective">
                <option value="">Free Cam</option>
                <option value="front">Front</option>
                <option value="back">Back</option>
                <option value="left">Left</option>
                <option value="right">Right</option>
                <option value="top">Top</option>
                <option value="bottom">Bottom</option>
                <option value="isometric">Isometric</option>
                <option value="three_quarter">¾ View</option>
            </select>

            <select data-action="light" title="Lighting Rig">
                <option value="studio">Studio Light</option>
                <option value="outdoor">Outdoor</option>
                <option value="dramatic">Dramatic</option>
                <option value="flat">Flat Base</option>
                <option value="rim">Rim Peak</option>
            </select>

            <div class="v3d-spacer"></div>

            <div class="v3d-toolbar-group">
                <button data-action="translate" title="Move Model (W)" class="gizmo-btn">⬌</button>
                <button data-action="rotate" title="Rotate Model (E)" class="gizmo-btn">↻</button>
                <button data-action="scale" title="Scale Model (R)" class="gizmo-btn">⤡</button>
                <button data-action="space" title="Toggle Local/World Space" style="color:#4db8ff;font-weight:bold;">🌍</button>
            </div>

            <div class="v3d-toolbar-group">
                <button data-action="grid" title="Toggle Floor Grid">⊞</button>
                <button data-action="axes" title="Toggle World Axes">⊹</button>
                <button data-action="fit" title="Recenter Camera">⊡</button>
            </div>
        </div>
        <div class="v3d-canvas-wrap" style="width:100%;height:400px;"></div>
        <div class="v3d-status">
            <span data-info="verts">Verts: —</span>
            <span data-info="faces">Faces: —</span>
            <span data-info="dims">Size: —</span>
            <span class="v3d-fps" data-info="fps">FPS: —</span>
        </div>
        <div class="v3d-loading" style="display:none;">
            <div class="v3d-spinner"></div>
            <span>Loading...</span>
        </div>
    `;

    // Add as DOM widget
    const widget = node.addDOMWidget('v3d_viewer', 'customWidget', container, {
        serialize: false,
        hideOnZoom: false,
    });

    // Size the node to fit
    node.setSize([560, 600]);

    // Store references
    node._v3dContainer = container;
    node._v3dViewer = null;
    node._v3dLoaded = false;
    viewerInstances.set(node.id, node);

    // Bind instant model loading when 'model_file' changes & reactive letterboxing
    let lastModel = null;
    let lastW = -1, lastH = -1, lastNodeW = -1, lastNodeH = -1;
    setInterval(() => {
        if (!node._v3dViewer) return;
        
        // 1. Reactive Letterboxing logic (decouples visual size from output size without squashing)
        const wConfig = node.widgets.find(w => w.name === "width" || w.name === "width (INT)");
        const hConfig = node.widgets.find(w => w.name === "height" || w.name === "height (INT)");
        
        // ComfyUI fails natively if widget values are somehow nullified, so we intercept and sanitize them
        if (wConfig && (wConfig.value == null || isNaN(wConfig.value) || wConfig.value === 0)) wConfig.value = 1024;
        if (hConfig && (hConfig.value == null || isNaN(hConfig.value) || hConfig.value === 0)) hConfig.value = 1024;

        const outW = parseInt(wConfig ? wConfig.value : 512) || 512;
        const outH = parseInt(hConfig ? hConfig.value : 512) || 512;
        
        const nodeW = Math.max(200, node.size[0] - 40);
        const nodeH = Math.max(200, node.size[1] - 150);
        
        if (outW !== lastW || outH !== lastH || nodeW !== lastNodeW || nodeH !== lastNodeH) {
            lastW = outW; lastH = outH; lastNodeW = nodeW; lastNodeH = nodeH;
            
            const targetAspect = outW / outH;
            let visualW = nodeW;
            let visualH = nodeW / targetAspect;
            
            if (visualH > nodeH) {
                // Constrained by height
                visualH = nodeH;
                visualW = nodeH * targetAspect;
            }
            
            const wrap = node._v3dContainer.querySelector('.v3d-canvas-wrap');
            if (wrap) {
                wrap.style.width = visualW + 'px';
                wrap.style.height = visualH + 'px';
                wrap.style.margin = "0 auto"; // Letterbox center it
                node._v3dViewer.resize(visualW, visualH);
            }
        }
        
        // 2. Auto-load model when selection changes (bypass manual queue prompt)
        const modelWidget = node.widgets.find(w => w.name === "model_file");
        if (modelWidget && modelWidget.value) {
            if (lastModel === null) {
                lastModel = modelWidget.value;
            } else if (lastModel !== modelWidget.value) {
                lastModel = modelWidget.value;
                const ext = modelWidget.value.split('.').pop().toLowerCase();
                const basePath = node.widgets.find(w => w.name === "custom_path")?.value || "";
                let fullPath = modelWidget.value;
                if (basePath) fullPath = basePath.replace(/\/$/, '') + '/' + fullPath;
                
                const url = `/viewer3d/model/${fullPath}`;
                const overlay = node._v3dContainer.querySelector('.v3d-loading-overlay');
                if (overlay) {
                    overlay.style.display = 'flex';
                    overlay.querySelector('span').textContent = `Loading ${ext.toUpperCase()}...`;
                }
                
                node._v3dViewer.loadModel(url, ext, {}).then(() => {
                    if (overlay) overlay.style.display = 'none';
                    node._v3dViewer.currentModelPath = fullPath;
                    node._v3dLoaded = true;
                }).catch(err => {
                    console.error('[3D Viewer Pro] Auto-load error:', err);
                    if (overlay) overlay.innerHTML = `<div style="color:#f85149;text-align:center;padding:20px;">❌ Auto-load failed</div>`;
                });
            }
        }
    }, 100);

    // Bind toolbar events
    container.querySelector('[data-action="mode"]').onchange = (e) => {
        if (node._v3dViewer) node._v3dViewer.setRenderMode(e.target.value);
    };
    container.querySelector('[data-action="fov"]').oninput = (e) => {
        if (node._v3dViewer) {
            const val = parseFloat(e.target.value);
            container.querySelector('[data-id="fov-val"]').textContent = val;
            node._v3dViewer.camera.setFocalLength(val);
            node._v3dViewer.camera.updateProjectionMatrix();
            if (node.setDirtyCanvas) node.setDirtyCanvas(true);
        }
    };
    container.querySelector('[data-action="clear-bg"]').onclick = () => {
        if (node._v3dViewer) {
            node._v3dViewer.scene.background = new THREE.Color('#1a1a2e');
            node._v3dViewer.bgTexture = null;
        }
    };
    container.querySelector('[data-action="camera"]').onchange = (e) => {
        if (node._v3dViewer && e.target.value) node._v3dViewer.setCameraPreset(e.target.value);
        e.target.value = '';
    };
    container.querySelector('[data-action="light"]').onchange = (e) => {
        if (node._v3dViewer) node._v3dViewer._setupLighting(e.target.value);
    };
    container.querySelector('[data-action="grid"]').onclick = () => {
        if (node._v3dViewer) { node._v3dViewer.showGrid = !node._v3dViewer.showGrid; node._v3dViewer._setupGrid(); }
    };
    container.querySelector('[data-action="axes"]').onclick = () => {
        if (node._v3dViewer) { node._v3dViewer.showAxes = !node._v3dViewer.showAxes; node._v3dViewer._setupAxes(); }
    };
    
    // Transform controls bindings
    let currentGizmoAction = null;
    const updateGizmoBtns = () => {
        container.querySelectorAll('.gizmo-btn').forEach(b => {
            b.style.background = (b.dataset.action === currentGizmoAction) ? 'rgba(77,184,255,0.4)' : '';
        });
    };
    
    const toggleGizmo = (mode, actionName) => {
        const viewer = node._v3dViewer;
        if (viewer && viewer.transformControls && viewer.model) {
            const tc = viewer.transformControls;
            if (currentGizmoAction === actionName && tc.object === viewer.model) {
                // If same mode and active, detach to hide it entirely
                tc.detach();
                tc.enabled = false;
                currentGizmoAction = null;
            } else {
                tc.attach(viewer.model);
                tc.setMode(mode);
                tc.enabled = true;
                currentGizmoAction = actionName;
            }
            updateGizmoBtns();
        }
    };
    
    container.querySelector('[data-action="translate"]').onclick = () => toggleGizmo('translate', 'translate');
    container.querySelector('[data-action="rotate"]').onclick = () => toggleGizmo('rotate', 'rotate');
    container.querySelector('[data-action="scale"]').onclick = () => toggleGizmo('scale', 'scale');

    container.querySelector('[data-action="space"]').onclick = (e) => {
        const viewer = node._v3dViewer;
        if (viewer && viewer.transformControls) {
            const tc = viewer.transformControls;
            const newSpace = tc.space === 'local' ? 'world' : 'local';
            tc.setSpace(newSpace);
            e.target.title = `Space: ${newSpace.toUpperCase()}`;
            e.target.innerHTML = newSpace === 'local' ? '📦' : '🌍';
        }
    };

    container.querySelector('[data-action="fit"]').onclick = () => {
        if (node._v3dViewer) node._v3dViewer._zoomToFit();
    };
    container.querySelector('[data-action="bg"]').onclick = () => {
        const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const w = img.naturalWidth; const h = img.naturalHeight;
                // Auto-configure node widget dimensions
                const wConfig = node.widgets.find(wg => wg.name === "width");
                const hConfig = node.widgets.find(wg => wg.name === "height");
                if (wConfig) { wConfig.value = w; if (wConfig.callback) wConfig.callback(); }
                if (hConfig) { hConfig.value = h; if (hConfig.callback) hConfig.callback(); }
                
                if (node._v3dViewer) {
                    const texLoader = new THREE.TextureLoader();
                    texLoader.load(url, (texture) => {
                        texture.colorSpace = THREE.SRGBColorSpace;
                        node._v3dViewer.bgTexture = texture;
                        node._v3dViewer.scene.background = texture;
                        node._v3dViewer.setBackground = function(color) { /* override */ };
                    });
                }
            };
            img.src = url;
        };
        inp.click();
    };

    // Update status periodically
    setInterval(() => {
        if (node._v3dViewer?.modelInfo) {
            const info = node._v3dViewer.modelInfo;
            container.querySelector('[data-info="verts"]').textContent = `Verts: ${info.verts.toLocaleString()}`;
            container.querySelector('[data-info="faces"]').textContent = `Faces: ${info.faces.toLocaleString()}`;
            container.querySelector('[data-info="dims"]').textContent = `Size: ${info.dims}`;
            container.querySelector('[data-info="fps"]').textContent = `FPS: ${node._v3dViewer.fps}`;
        }
    }, 1000);
}


async function handleViewerOutput(node, data) {
    const container = node._v3dContainer;
    if (!container) return;

    const loadingEl = container.querySelector('.v3d-loading');
    const canvasWrap = container.querySelector('.v3d-canvas-wrap');

    // Show loading
    loadingEl.style.display = 'flex';
    loadingEl.querySelector('span').textContent = 'Loading Three.js...';

    // Load Three.js if needed
    const ok = await loadThreeJS();
    if (!ok) {
        loadingEl.innerHTML = `<div style="color:#f85149;text-align:center;padding:20px;">
            ❌ Failed to load Three.js<br><small>${threeError?.message || 'Unknown error'}</small>
            <br><br><small>Check browser console (F12) for details</small></div>`;
        return;
    }

    // Create viewer if not exists
    if (!node._v3dViewer) {
        const rect = canvasWrap.getBoundingClientRect();
        const w = Math.max(rect.width || 500, 300);
        const h = Math.max(rect.height || 400, 300);

        node._v3dViewer = new Viewer3D(container, w, h);
        await node._v3dViewer.init();
    }

    const viewer = node._v3dViewer;

    // Apply settings
    if (data.viewer) {
        if (data.viewer.bg_color) viewer.setBackground(data.viewer.bg_color);
        if (data.viewer.lighting_preset) viewer._setupLighting(data.viewer.lighting_preset);
        if (data.viewer.render_mode) viewer.setRenderMode(data.viewer.render_mode);
        if (data.viewer.show_grid !== undefined) { viewer.showGrid = data.viewer.show_grid; viewer._setupGrid(); }
        if (data.viewer.show_axes !== undefined) { viewer.showAxes = data.viewer.show_axes; viewer._setupAxes(); }
    }

    // Load model
    if (data.model) {
        if (viewer.currentModelPath === data.model.path && viewer._v3dLoaded) {
            // Already loaded! Ignore to preserve gizmo transforms and camera angles.
            loadingEl.style.display = 'none';
        } else {
            loadingEl.querySelector('span').textContent = `Loading ${data.model.format.toUpperCase()} model...`;
            try {
                const url = `/viewer3d/model/${data.model.path}`;
                await viewer.loadModel(url, data.model.format, data.model.settings || {});
                
                viewer.currentModelPath = data.model.path;
                viewer._v3dLoaded = true;
                
            } catch (err) {
                console.error('[3D Viewer Pro] Model load error:', err);
                loadingEl.innerHTML = `<div style="color:#f85149;text-align:center;padding:20px;">
                    ❌ Failed to load model<br><small>${err.message}</small></div>`;
                return;
            }
        }
        
        // Always apply camera preset if asked, but default usually doesn't force override
        if (data.viewer?.camera_preset && data.viewer.camera_preset !== 'default') {
            viewer.setCameraPreset(data.viewer.camera_preset);
        }
    }

    // Hide loading
    loadingEl.style.display = 'none';
}

// ═══════════════════════════════════════════════════════════════════════════
//  MULTI-PASS RENDER PIPELINE — Responds to PromptServer rendering sync
// ═══════════════════════════════════════════════════════════════════════════
api.addEventListener("viewer3d.render_request", async (event) => {
    const request = event.detail;
    console.log('[3D Viewer Pro] Render request received:', request);
    if (!request || !request.unique_id) {
        console.error('[3D Viewer Pro] Invalid render request - missing unique_id');
        return;
    }
    
    let targetNode = null;
    for (const [nodeId, node] of viewerInstances.entries()) {
        console.log(`[3D Viewer Pro] Checking node ${nodeId} vs unique_id ${request.unique_id}`);
        if (nodeId.toString() === request.unique_id.toString() || request.unique_id.toString().endsWith(`:${nodeId}`)) {
            targetNode = node;
            break;
        }
    }
    
    // Aggressive Fallback: Due to ComfyUI Sub-Graphs / Group Nodes, ID mapping can sometimes break visually vs physically.
    if (!targetNode && viewerInstances.size > 0) {
        console.warn(`[3D Viewer Pro] ID Exact Match Failed. Falling back to first available 3D node!`);
        targetNode = viewerInstances.values().next().value;
    }
    
    if (!targetNode) {
        console.error('[3D Viewer Pro] No nodes completely initialized to handle unique_id:', request.unique_id);
        // Signal completion anyway so Python doesn't hang for 30 seconds
        await fetch('/viewer3d/render_complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unique_id: request.unique_id })
        });
        return;
    }

    await performRenderSequence(request, targetNode);
});

async function performRenderSequence(request, node) {
    const viewer = node._v3dViewer;
    if (!viewer || !viewer.model) {
        console.error('[3D Viewer Pro] No viewer or model available for render');
        await fetch('/viewer3d/render_complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unique_id: request.unique_id })
        });
        return;
    }

    console.log('[3D Viewer Pro] Starting render sequence...');

    const config = request.config.render;
    const passes = ["color", "depth", "normal", "wireframe", "ao_silhouette", "mask"];
    const originalMode = viewer.renderMode;
    const origBackground = viewer.scene.background ? viewer.scene.background.clone() : null;

    // Enforce flat rendering lighting for all outputs
    const origLightRig = viewer.currentLightRig || 'studio';
    viewer._setupLighting('flat');

    // Apply config settings to viewport for rendering
    if (config.bg_transparent) {
         viewer.scene.background = null;
         viewer.renderer.setClearColor(0x000000, 0); // Transparent RGBA buffer
    } else if (viewer.bgTexture) {
         viewer.scene.background = viewer.bgTexture;
    }

    // Temporarily hide UI helpers and Gizmos during render
    const showG = viewer.showGrid; const showA = viewer.showAxes;
    let gizmoState = false;
    let gizmoAttached = null;
    viewer.showGrid = false; viewer.showAxes = false;
    if (viewer.transformControls) {
        gizmoState = viewer.transformControls.enabled;
        gizmoAttached = viewer.transformControls.object;
        viewer.transformControls.enabled = false;
        viewer.transformControls.visible = false;
        viewer.transformControls.detach(); // Completely remove from rendering buffer boundary
    }
    if (viewer.gridHelper) viewer.gridHelper.visible = false;
    if (viewer.axesHelper) viewer.axesHelper.visible = false;

    // Temporarily up-scale the renderer to match output resolution natively
    const wrap = node._v3dContainer.querySelector('.v3d-canvas-wrap');
    const wConfig = node.widgets.find(w => w.name === "width" || w.name === "width (INT)");
    const hConfig = node.widgets.find(w => w.name === "height" || w.name === "height (INT)");
    const outW = parseInt(wConfig ? wConfig.value : 512) || 512;
    const outH = parseInt(hConfig ? hConfig.value : 512) || 512;
    
    // Bypass Windows OS / Browser DPI scaling factors to produce PERFECT pixel resolution internally
    const origPixelRatio = viewer.renderer.getPixelRatio();
    viewer.renderer.setPixelRatio(1.0);
    
    const origVisualW = wrap ? wrap.clientWidth : outW;
    const origVisualH = wrap ? wrap.clientHeight : outH;
    viewer.resize(outW, outH);
    console.log(`[3D Viewer Pro] Render resolution: ${outW}x${outH} at 1.0 Pixel Ratio`);

    for (const passName of passes) {
        try {
            // Set material for this pass
            if (passName === "color") viewer.setRenderMode("color");
            else if (passName === "depth") viewer.setRenderMode("depth");
            else if (passName === "normal") viewer.setRenderMode("normal");
            else if (passName === "wireframe") viewer.setRenderMode("wireframe");
            else if (passName === "ao_silhouette") viewer.setRenderMode("ao");
            else if (passName === "mask") {
                viewer.setRenderMode("mask");
                // Only force white background if we are NOT operating in pure RGBA transparent mode
                if (!config.bg_transparent) {
                    viewer.scene.background = new THREE.Color("#ffffff");
                }
            }
            
            // CRITICAL: WebGL shaders take physical MS to swap materials. If you render synchronously before the GPU catches up, it dumps an empty or pure black frame buffer to dataURL!
            await new Promise(r => setTimeout(r, 60));
            
            // Force a clean render
            viewer.renderer.clear();
            viewer.renderer.render(viewer.scene, viewer.camera);
            
            const dataUrl = viewer.renderer.domElement.toDataURL("image/png");
            console.log(`[3D Viewer Pro] Pass "${passName}" rendered, data length: ${dataUrl.length}`);

            const resp = await fetch('/viewer3d/upload_render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unique_id: request.unique_id,
                    pass_name: passName,
                    image: dataUrl
                })
            });
            const result = await resp.json();
            console.log(`[3D Viewer Pro] Pass "${passName}" upload result:`, result);
            
            // Restore background after mask pass
            if (passName === "mask") {
                if (config.bg_transparent) {
                    viewer.scene.background = null;
                } else if (viewer.bgTexture) {
                    viewer.scene.background = viewer.bgTexture;
                } else if (origBackground) {
                    viewer.scene.background = origBackground;
                }
            }
        } catch (err) {
            console.error(`[3D Viewer Pro] Error in pass "${passName}":`, err);
        }
    }

    // Restore viewport
    viewer._setupLighting(origLightRig);
    viewer.setRenderMode(originalMode);
    viewer.showGrid = showG; viewer.showAxes = showA;
    if (viewer.transformControls) {
        if (gizmoAttached) viewer.transformControls.attach(gizmoAttached);
        viewer.transformControls.enabled = gizmoState;
        viewer.transformControls.visible = gizmoState;
    }
    viewer._setupGrid(); viewer._setupAxes();
    viewer.scene.background = origBackground;
    
    // Restore OS Scaling and layout visually
    viewer.renderer.setPixelRatio(origPixelRatio);
    viewer.resize(origVisualW, origVisualH);

    // Signal complete
    console.log('[3D Viewer Pro] Render sequence complete, signaling Python...');
    await fetch('/viewer3d/render_complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unique_id: request.unique_id })
    });
    console.log('[3D Viewer Pro] Render complete signal sent.');
}


// ═══════════════════════════════════════════════════════════════════════════
//  TURNTABLE RENDER PIPELINE — Offscreen 360° orbit rendering
// ═══════════════════════════════════════════════════════════════════════════
api.addEventListener("viewer3d.turntable_request", async (event) => {
    const request = event.detail;
    console.log('[3D Viewer Pro] Turntable request received:', request);
    if (!request || !request.unique_id) {
        console.error('[3D Viewer Pro] Invalid turntable request');
        return;
    }

    // Find the viewer instance that has the model loaded
    let targetNode = null;
    for (const [nodeId, node] of viewerInstances.entries()) {
        if (node._v3dViewer && node._v3dViewer.model) {
            targetNode = node;
            break;
        }
    }

    if (!targetNode || !targetNode._v3dViewer || !targetNode._v3dViewer.model) {
        console.error('[3D Viewer Pro] No viewer with model found for turntable');
        await fetch('/viewer3d/render_complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unique_id: request.unique_id })
        });
        return;
    }

    await performTurntableSequence(request, targetNode);
});

async function performTurntableSequence(request, node) {
    const sourceViewer = node._v3dViewer;
    const config = request.config.turntable;
    const outW = config.width || 1024;
    const outH = config.height || 1024;
    const angles = config.angles || [];
    const pitch = (config.pitch || 20.0) * Math.PI / 180.0;
    const fov = config.fov || 50.0;
    const renderMode = config.render_mode || 'color';
    const bgTransparent = config.bg_transparent || false;
    const bgColor = config.bg_color || '#000000';

    console.log(`[3D Viewer Pro] Turntable: ${angles.length} frames at ${outW}x${outH}`);

    // Create an offscreen renderer
    const offRenderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        preserveDrawingBuffer: true,
    });
    offRenderer.setSize(outW, outH);
    offRenderer.setPixelRatio(1.0);
    offRenderer.toneMapping = THREE.ACESFilmicToneMapping;
    offRenderer.toneMappingExposure = 1.0;
    offRenderer.outputColorSpace = THREE.SRGBColorSpace;

    // Clone scene essentials into a separate scene
    const offScene = new THREE.Scene();

    if (bgTransparent) {
        offScene.background = null;
        offRenderer.setClearColor(0x000000, 0);
    } else {
        offScene.background = new THREE.Color(bgColor);
    }

    // Add the existing model directly (shared reference — do NOT dispose)
    offScene.add(sourceViewer.model);

    // Flat lighting for clean outputs
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    offScene.add(ambientLight);
    const dirLight = new THREE.DirectionalLight(0xffffff, 0.5);
    dirLight.position.set(5, 10, 7);
    offScene.add(dirLight);

    // Camera
    const offCamera = new THREE.PerspectiveCamera(fov, outW / outH, 0.01, 1000);

    // Get model bounding box for orbit distance
    const box = new THREE.Box3().setFromObject(sourceViewer.model);
    const center = new THREE.Vector3(); box.getCenter(center);
    const size = new THREE.Vector3(); box.getSize(size);
    const maxDim = Math.max(size.x, size.y, size.z);
    const camFov = fov * (Math.PI / 180);
    const dist = (maxDim / 2) / Math.tan(camFov / 2) * 1.6;

    // Apply material override if needed
    const savedMats = new Map();
    if (renderMode !== 'color') {
        sourceViewer.model.traverse(c => {
            if (c.isMesh) savedMats.set(c.uuid, c.material);
        });
        let mat;
        switch (renderMode) {
            case 'normal': mat = new THREE.MeshNormalMaterial(); break;
            case 'depth': mat = new THREE.ShaderMaterial({
                vertexShader: `varying float vD; void main(){vec4 mv=modelViewMatrix*vec4(position,1.0);vD=-mv.z;gl_Position=projectionMatrix*mv;}`,
                fragmentShader: `varying float vD;void main(){float d=clamp(1.0-(vD-0.1)/(20.0-0.1),0.0,1.0);gl_FragColor=vec4(vec3(d),1.0);}`,
            }); break;
            case 'wireframe': mat = new THREE.MeshBasicMaterial({ color: 0x00ffaa, wireframe: true }); break;
            case 'matcap': mat = new THREE.ShaderMaterial({
                vertexShader: `varying vec3 vN,vV;void main(){vN=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vV=-mv.xyz;gl_Position=projectionMatrix*mv;}`,
                fragmentShader: `varying vec3 vN,vV;void main(){vec3 n=normalize(vN);vec3 v=normalize(vV);float f=pow(1.0-max(dot(n,v),0.0),2.0);vec3 w=vec3(0.85,0.75,0.65),c=vec3(0.3,0.35,0.5);vec3 col=mix(w,c,f);float d=max(dot(n,normalize(vec3(0.5,1.0,0.3))),0.0);col*=0.5+0.5*d;gl_FragColor=vec4(col,1.0);}`,
            }); break;
            default: mat = null;
        }
        if (mat) {
            sourceViewer.model.traverse(c => { if (c.isMesh) c.material = mat; });
        }
    }

    // Render each angle
    for (let i = 0; i < angles.length; i++) {
        const yawDeg = angles[i];
        const yawRad = yawDeg * Math.PI / 180.0;

        offCamera.position.set(
            center.x + dist * Math.sin(yawRad) * Math.cos(pitch),
            center.y + dist * Math.sin(pitch),
            center.z + dist * Math.cos(yawRad) * Math.cos(pitch)
        );
        offCamera.lookAt(center);

        await new Promise(r => setTimeout(r, 30));

        offRenderer.clear();
        offRenderer.render(offScene, offCamera);

        const dataUrl = offRenderer.domElement.toDataURL("image/png");
        const paddedIdx = String(i).padStart(4, '0');

        try {
            await fetch('/viewer3d/upload_render', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    unique_id: request.unique_id,
                    pass_name: `turntable_${paddedIdx}`,
                    image: dataUrl,
                })
            });
            console.log(`[3D Viewer Pro] Turntable frame ${i}/${angles.length} uploaded`);
        } catch (err) {
            console.error(`[3D Viewer Pro] Turntable frame ${i} upload failed:`, err);
        }
    }

    // Restore materials if overridden
    if (savedMats.size > 0) {
        sourceViewer.model.traverse(c => {
            if (c.isMesh && savedMats.has(c.uuid)) c.material = savedMats.get(c.uuid);
        });
    }

    // Put the model back in the original scene
    sourceViewer.scene.add(sourceViewer.model);

    // Cleanup offscreen renderer
    offRenderer.dispose();

    // Signal completion
    console.log('[3D Viewer Pro] Turntable sequence complete, signaling Python...');
    await fetch('/viewer3d/render_complete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ unique_id: request.unique_id })
    });
}
