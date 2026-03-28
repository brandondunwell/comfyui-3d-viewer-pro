/**
 * SceneManager.js — Scene setup: grid, axes, ground shadow, background
 */
import * as THREE from '../lib/three.module.min.js';

export class SceneManager {
    constructor(scene) {
        this.scene = scene;
        this.gridHelper = null;
        this.axesHelper = null;
        this.groundPlane = null;
        this.groundShadow = null;
    }

    setupGrid(visible = true, size = 10, divisions = 20, color1 = 0x444466, color2 = 0x333355) {
        if (this.gridHelper) {
            this.scene.remove(this.gridHelper);
            this.gridHelper.dispose();
        }
        if (!visible) return;

        this.gridHelper = new THREE.GridHelper(size, divisions, color1, color2);
        this.gridHelper.material.opacity = 0.3;
        this.gridHelper.material.transparent = true;
        this.gridHelper.material.depthWrite = false;
        this.gridHelper.renderOrder = -1;
        this.scene.add(this.gridHelper);
    }

    setupAxes(visible = true, size = 1.5) {
        if (this.axesHelper) {
            this.scene.remove(this.axesHelper);
            this.axesHelper.dispose();
        }
        if (!visible) return;

        this.axesHelper = new THREE.AxesHelper(size);
        this.axesHelper.material.depthTest = false;
        this.axesHelper.renderOrder = 999;
        this.scene.add(this.axesHelper);
    }

    setupGroundShadow(visible = true) {
        if (this.groundPlane) {
            this.scene.remove(this.groundPlane);
        }
        if (!visible) return;

        const geo = new THREE.PlaneGeometry(20, 20);
        const mat = new THREE.ShadowMaterial({ opacity: 0.3 });
        this.groundPlane = new THREE.Mesh(geo, mat);
        this.groundPlane.rotation.x = -Math.PI / 2;
        this.groundPlane.position.y = -0.001;
        this.groundPlane.receiveShadow = true;
        this.scene.add(this.groundPlane);
    }

    setBackground(color = '#1a1a2e', transparent = false) {
        if (transparent) {
            this.scene.background = null;
        } else {
            this.scene.background = new THREE.Color(color);
        }
    }

    dispose() {
        if (this.gridHelper) { this.scene.remove(this.gridHelper); this.gridHelper.dispose(); }
        if (this.axesHelper) { this.scene.remove(this.axesHelper); this.axesHelper.dispose(); }
        if (this.groundPlane) { this.scene.remove(this.groundPlane); }
    }
}
