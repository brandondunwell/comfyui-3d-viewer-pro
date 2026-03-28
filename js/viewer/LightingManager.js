/**
 * LightingManager.js — Light rigs and preset management
 */
import * as THREE from '../lib/three.module.min.js';

export class LightingManager {
    constructor(scene) {
        this.scene = scene;
        this.lights = [];
        this.ambientLight = null;
        this.currentPreset = null;
    }

    /**
     * Apply a lighting preset
     */
    setPreset(name) {
        this.clearLights();
        this.currentPreset = name;

        switch (name) {
            case 'studio':
                this._setupStudio();
                break;
            case 'outdoor':
                this._setupOutdoor();
                break;
            case 'dramatic':
                this._setupDramatic();
                break;
            case 'flat':
                this._setupFlat();
                break;
            case 'rim':
                this._setupRim();
                break;
            default:
                this._setupStudio();
        }
    }

    _setupStudio() {
        // Ambient
        this.ambientLight = new THREE.AmbientLight(0x404060, 0.4);
        this.scene.add(this.ambientLight);
        this.lights.push(this.ambientLight);

        // Key light (warm, top-right)
        const key = new THREE.DirectionalLight(0xfff0e0, 1.2);
        key.position.set(3, 5, 4);
        key.castShadow = true;
        key.shadow.mapSize.width = 2048;
        key.shadow.mapSize.height = 2048;
        key.shadow.camera.near = 0.1;
        key.shadow.camera.far = 30;
        key.shadow.camera.left = -5;
        key.shadow.camera.right = 5;
        key.shadow.camera.top = 5;
        key.shadow.camera.bottom = -5;
        key.shadow.bias = -0.0005;
        this.scene.add(key);
        this.lights.push(key);

        // Fill light (cool, left)
        const fill = new THREE.DirectionalLight(0xc0d0ff, 0.5);
        fill.position.set(-3, 2, 2);
        this.scene.add(fill);
        this.lights.push(fill);

        // Back/rim light
        const rim = new THREE.DirectionalLight(0xffffff, 0.3);
        rim.position.set(0, 3, -4);
        this.scene.add(rim);
        this.lights.push(rim);

        // Soft hemisphere for ambient bounce
        const hemi = new THREE.HemisphereLight(0x8899bb, 0x445566, 0.3);
        this.scene.add(hemi);
        this.lights.push(hemi);
    }

    _setupOutdoor() {
        this.ambientLight = new THREE.AmbientLight(0x6688cc, 0.3);
        this.scene.add(this.ambientLight);
        this.lights.push(this.ambientLight);

        // Sun
        const sun = new THREE.DirectionalLight(0xffeedd, 1.5);
        sun.position.set(5, 8, 3);
        sun.castShadow = true;
        sun.shadow.mapSize.width = 2048;
        sun.shadow.mapSize.height = 2048;
        sun.shadow.camera.near = 0.1;
        sun.shadow.camera.far = 40;
        sun.shadow.camera.left = -8;
        sun.shadow.camera.right = 8;
        sun.shadow.camera.top = 8;
        sun.shadow.camera.bottom = -8;
        this.scene.add(sun);
        this.lights.push(sun);

        // Sky hemisphere
        const hemi = new THREE.HemisphereLight(0x87ceeb, 0x362d1b, 0.6);
        this.scene.add(hemi);
        this.lights.push(hemi);
    }

    _setupDramatic() {
        this.ambientLight = new THREE.AmbientLight(0x111122, 0.15);
        this.scene.add(this.ambientLight);
        this.lights.push(this.ambientLight);

        // Strong key from side
        const key = new THREE.SpotLight(0xff9944, 2.0, 20, Math.PI / 6, 0.5, 1);
        key.position.set(4, 4, 2);
        key.castShadow = true;
        key.shadow.mapSize.width = 2048;
        key.shadow.mapSize.height = 2048;
        this.scene.add(key);
        this.lights.push(key);

        // Rim light
        const rim = new THREE.DirectionalLight(0x4466ff, 0.8);
        rim.position.set(-3, 2, -3);
        this.scene.add(rim);
        this.lights.push(rim);
    }

    _setupFlat() {
        // Even lighting from all directions - no shadows
        this.ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
        this.scene.add(this.ambientLight);
        this.lights.push(this.ambientLight);

        const hemi = new THREE.HemisphereLight(0xffffff, 0xcccccc, 0.5);
        this.scene.add(hemi);
        this.lights.push(hemi);

        // Soft directional from front
        const front = new THREE.DirectionalLight(0xffffff, 0.3);
        front.position.set(0, 2, 5);
        this.scene.add(front);
        this.lights.push(front);
    }

    _setupRim() {
        this.ambientLight = new THREE.AmbientLight(0x111133, 0.2);
        this.scene.add(this.ambientLight);
        this.lights.push(this.ambientLight);

        // Strong back lights creating rim effect
        const colors = [0xff6644, 0x4488ff, 0x44ff88];
        const positions = [
            [-3, 3, -3],
            [3, 3, -3],
            [0, 4, -2],
        ];

        for (let i = 0; i < 3; i++) {
            const light = new THREE.DirectionalLight(colors[i], 0.9);
            light.position.set(...positions[i]);
            this.scene.add(light);
            this.lights.push(light);
        }

        // Subtle fill
        const fill = new THREE.DirectionalLight(0x333344, 0.3);
        fill.position.set(0, 1, 4);
        this.scene.add(fill);
        this.lights.push(fill);
    }

    setIntensity(multiplier) {
        this.lights.forEach(light => {
            if (light._originalIntensity === undefined) {
                light._originalIntensity = light.intensity;
            }
            light.intensity = light._originalIntensity * multiplier;
        });
    }

    clearLights() {
        this.lights.forEach(light => {
            this.scene.remove(light);
            if (light.dispose) light.dispose();
        });
        this.lights = [];
        this.ambientLight = null;
    }

    dispose() {
        this.clearLights();
    }
}
