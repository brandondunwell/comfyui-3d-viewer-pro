/**
 * CameraController.js — OrbitControls + camera presets + zoom-to-fit
 */
import * as THREE from '../lib/three.module.min.js';
import { OrbitControls } from '../lib/OrbitControls.js';

export class CameraController {
    constructor(camera, domElement) {
        this.camera = camera;
        this.controls = new OrbitControls(camera, domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.rotateSpeed = 0.8;
        this.controls.zoomSpeed = 1.2;
        this.controls.panSpeed = 0.5;
        this.controls.minDistance = 0.1;
        this.controls.maxDistance = 100;
        this.controls.enablePan = true;
        this.controls.screenSpacePanning = true;

        this.savedPositions = {};
        this.isOrtho = false;
        this.perspCamera = camera;
        this.orthoCamera = null;
    }

    update() {
        this.controls.update();
    }

    /**
     * Zoom camera to fit a bounding box
     */
    zoomToFit(boundingBox, padding = 1.4) {
        if (!boundingBox) return;

        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        const size = new THREE.Vector3();
        boundingBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const fov = this.camera.fov * (Math.PI / 180);
        let distance = (maxDim / 2) / Math.tan(fov / 2) * padding;

        this.controls.target.copy(center);
        this.camera.position.set(
            center.x + distance * 0.5,
            center.y + distance * 0.4,
            center.z + distance * 0.7
        );
        this.camera.lookAt(center);
        this.controls.update();
    }

    /**
     * Set camera from yaw/pitch/distance/fov parameters
     */
    setCameraFromAngles(yaw, pitch, distance, fov) {
        const yawRad = THREE.MathUtils.degToRad(yaw);
        const pitchRad = THREE.MathUtils.degToRad(pitch);

        const target = this.controls.target.clone();
        const x = target.x + distance * Math.cos(pitchRad) * Math.sin(yawRad);
        const y = target.y + distance * Math.sin(pitchRad);
        const z = target.z + distance * Math.cos(pitchRad) * Math.cos(yawRad);

        this.camera.position.set(x, y, z);
        if (fov && this.camera.isPerspectiveCamera) {
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
        }
        this.camera.lookAt(target);
        this.controls.update();
    }

    /**
     * Camera presets
     */
    setPreset(name, boundingBox) {
        if (!boundingBox) return;

        const center = new THREE.Vector3();
        boundingBox.getCenter(center);
        const size = new THREE.Vector3();
        boundingBox.getSize(size);
        const maxDim = Math.max(size.x, size.y, size.z);
        const dist = maxDim * 2.0;

        this.controls.target.copy(center);

        const presets = {
            front:         { pos: [center.x, center.y, center.z + dist] },
            back:          { pos: [center.x, center.y, center.z - dist] },
            left:          { pos: [center.x - dist, center.y, center.z] },
            right:         { pos: [center.x + dist, center.y, center.z] },
            top:           { pos: [center.x, center.y + dist, center.z + 0.001] },
            bottom:        { pos: [center.x, center.y - dist, center.z + 0.001] },
            isometric:     { pos: [center.x + dist * 0.577, center.y + dist * 0.577, center.z + dist * 0.577] },
            three_quarter: { pos: [center.x + dist * 0.5, center.y + dist * 0.35, center.z + dist * 0.75] },
        };

        const preset = presets[name];
        if (preset) {
            this.camera.position.set(...preset.pos);
            this.camera.lookAt(center);
            this.controls.update();
        }
    }

    savePosition(name) {
        this.savedPositions[name] = {
            position: this.camera.position.clone(),
            target: this.controls.target.clone(),
            fov: this.camera.fov,
        };
    }

    loadPosition(name) {
        const saved = this.savedPositions[name];
        if (saved) {
            this.camera.position.copy(saved.position);
            this.controls.target.copy(saved.target);
            if (this.camera.isPerspectiveCamera) {
                this.camera.fov = saved.fov;
                this.camera.updateProjectionMatrix();
            }
            this.controls.update();
        }
    }

    setFOV(fov) {
        if (this.camera.isPerspectiveCamera) {
            this.camera.fov = fov;
            this.camera.updateProjectionMatrix();
        }
    }

    dispose() {
        this.controls.dispose();
    }
}
