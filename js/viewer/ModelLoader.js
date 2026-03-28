/**
 * ModelLoader.js — Unified loader for GLB/GLTF/OBJ/STL/FBX with auto-detection
 */
import * as THREE from '../lib/three.module.min.js';
import { GLTFLoader } from '../lib/GLTFLoader.js';
import { OBJLoader } from '../lib/OBJLoader.js';
import { STLLoader } from '../lib/STLLoader.js';
import { FBXLoader } from '../lib/FBXLoader.js';

export class ModelLoader {
    constructor() {
        this.gltfLoader = new GLTFLoader();
        this.objLoader = new OBJLoader();
        this.stlLoader = new STLLoader();
        this.fbxLoader = new FBXLoader();
        this.loadedModel = null;
        this.animations = [];
        this.modelInfo = null;
    }

    /**
     * Load a 3D model from a URL, auto-detecting format
     * @param {string} url - URL to the model file
     * @param {string} format - File format (glb, gltf, obj, stl, fbx)
     * @param {object} settings - Model settings (up_direction, scale, center, auto_scale)
     * @param {function} onProgress - Progress callback (0-1)
     * @returns {Promise<{model: THREE.Object3D, animations: Array, info: object}>}
     */
    async load(url, format, settings = {}, onProgress = null) {
        const progressCb = (event) => {
            if (onProgress && event.total > 0) {
                onProgress(event.loaded / event.total);
            }
        };

        let result;
        switch (format.toLowerCase()) {
            case 'glb':
            case 'gltf':
                result = await this._loadGLTF(url, progressCb);
                break;
            case 'obj':
                result = await this._loadOBJ(url, progressCb);
                break;
            case 'stl':
                result = await this._loadSTL(url, progressCb);
                break;
            case 'fbx':
                result = await this._loadFBX(url, progressCb);
                break;
            default:
                throw new Error(`Unsupported format: ${format}`);
        }

        // Apply transformations
        this._applySettings(result.model, settings);

        // Extract model info
        result.info = this._extractInfo(result.model);

        this.loadedModel = result.model;
        this.animations = result.animations || [];
        this.modelInfo = result.info;

        return result;
    }

    async _loadGLTF(url, onProgress) {
        return new Promise((resolve, reject) => {
            this.gltfLoader.load(url, (gltf) => {
                const model = gltf.scene;
                model.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                resolve({
                    model,
                    animations: gltf.animations || [],
                });
            }, onProgress, reject);
        });
    }

    async _loadOBJ(url, onProgress) {
        return new Promise((resolve, reject) => {
            this.objLoader.load(url, (obj) => {
                obj.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                        // Default material if none
                        if (!child.material || (Array.isArray(child.material) && child.material.length === 0)) {
                            child.material = new THREE.MeshStandardMaterial({
                                color: 0x888888,
                                roughness: 0.5,
                                metalness: 0.1,
                            });
                        }
                    }
                });
                resolve({ model: obj, animations: [] });
            }, onProgress, reject);
        });
    }

    async _loadSTL(url, onProgress) {
        return new Promise((resolve, reject) => {
            this.stlLoader.load(url, (geometry) => {
                geometry.computeVertexNormals();
                const material = new THREE.MeshStandardMaterial({
                    color: 0x7799bb,
                    roughness: 0.4,
                    metalness: 0.2,
                });
                const mesh = new THREE.Mesh(geometry, material);
                mesh.castShadow = true;
                mesh.receiveShadow = true;

                const group = new THREE.Group();
                group.add(mesh);
                resolve({ model: group, animations: [] });
            }, onProgress, reject);
        });
    }

    async _loadFBX(url, onProgress) {
        return new Promise((resolve, reject) => {
            this.fbxLoader.load(url, (fbx) => {
                fbx.traverse((child) => {
                    if (child.isMesh) {
                        child.castShadow = true;
                        child.receiveShadow = true;
                    }
                });
                resolve({
                    model: fbx,
                    animations: fbx.animations || [],
                });
            }, onProgress, reject);
        });
    }

    /**
     * Apply up-direction, scale, and centering
     */
    _applySettings(model, settings) {
        const { up_direction = 'Y', scale = 1.0, center_model = true, auto_scale = true } = settings;

        // Up direction correction
        switch (up_direction) {
            case 'Z':
                model.rotation.x = -Math.PI / 2;
                break;
            case '-Y':
                model.rotation.z = Math.PI;
                break;
            case '-Z':
                model.rotation.x = Math.PI / 2;
                break;
            // 'Y' is default, no rotation needed
        }

        model.updateMatrixWorld(true);

        // Compute bounding box
        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);
        const center = new THREE.Vector3();
        box.getCenter(center);

        // Auto-scale to fit in unit cube
        if (auto_scale) {
            const maxDim = Math.max(size.x, size.y, size.z);
            if (maxDim > 0) {
                const autoScale = 2.0 / maxDim;
                model.scale.multiplyScalar(autoScale);
            }
        }

        // Apply user scale
        model.scale.multiplyScalar(scale);

        // Center model
        if (center_model) {
            model.updateMatrixWorld(true);
            const box2 = new THREE.Box3().setFromObject(model);
            const center2 = new THREE.Vector3();
            box2.getCenter(center2);
            model.position.sub(center2);
            // Keep model sitting on ground
            box2.setFromObject(model);
            model.position.y -= box2.min.y;
        }
    }

    /**
     * Extract model metadata
     */
    _extractInfo(model) {
        let vertexCount = 0;
        let faceCount = 0;
        let meshCount = 0;
        const materials = new Set();

        model.traverse((child) => {
            if (child.isMesh) {
                meshCount++;
                const geo = child.geometry;
                if (geo) {
                    vertexCount += geo.attributes.position ? geo.attributes.position.count : 0;
                    faceCount += geo.index ? geo.index.count / 3 : (geo.attributes.position ? geo.attributes.position.count / 3 : 0);
                }
                if (child.material) {
                    const mats = Array.isArray(child.material) ? child.material : [child.material];
                    mats.forEach(m => materials.add(m.name || 'unnamed'));
                }
            }
        });

        const box = new THREE.Box3().setFromObject(model);
        const size = new THREE.Vector3();
        box.getSize(size);

        return {
            vertexCount,
            faceCount: Math.round(faceCount),
            meshCount,
            materialCount: materials.size,
            materials: Array.from(materials),
            dimensions: { x: size.x.toFixed(3), y: size.y.toFixed(3), z: size.z.toFixed(3) },
            boundingBox: box,
        };
    }

    getBoundingBox() {
        if (this.loadedModel) {
            return new THREE.Box3().setFromObject(this.loadedModel);
        }
        return null;
    }

    dispose() {
        if (this.loadedModel) {
            this.loadedModel.traverse((child) => {
                if (child.isMesh) {
                    child.geometry?.dispose();
                    if (child.material) {
                        const mats = Array.isArray(child.material) ? child.material : [child.material];
                        mats.forEach(m => {
                            m.map?.dispose();
                            m.normalMap?.dispose();
                            m.roughnessMap?.dispose();
                            m.metalnessMap?.dispose();
                            m.dispose();
                        });
                    }
                }
            });
        }
        this.loadedModel = null;
        this.animations = [];
        this.modelInfo = null;
    }
}
