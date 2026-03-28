/**
 * RenderPassManager.js — Multi-pass rendering using material overrides
 */
import * as THREE from '../lib/three.module.min.js';

export class RenderPassManager {
    constructor(renderer, scene, camera) {
        this.renderer = renderer;
        this.scene = scene;
        this.camera = camera;
        this.originalMaterials = new Map();

        // Override materials
        this.depthMaterial = new THREE.MeshDepthMaterial({
            depthPacking: THREE.RGBADepthPacking,
        });
        this.normalMaterial = new THREE.MeshNormalMaterial();
        this.wireframeMaterial = new THREE.MeshBasicMaterial({
            color: 0x00ffaa,
            wireframe: true,
        });
        this.silhouetteMaterial = new THREE.MeshBasicMaterial({
            color: 0xffffff,
        });
        this.uvMaterial = null; // Created on demand with shader
        this.matcapMaterial = null; // Created when matcap texture loaded
        this.aoMaterial = null;
    }

    /**
     * Set the current render mode by overriding scene materials
     */
    setRenderMode(mode) {
        this._restoreMaterials();

        if (mode === 'color') return; // No override needed

        this._saveMaterials();

        let overrideMat = null;
        switch (mode) {
            case 'depth':
                overrideMat = this._createDepthVisMaterial();
                break;
            case 'normal':
                overrideMat = this.normalMaterial;
                break;
            case 'wireframe':
                overrideMat = this.wireframeMaterial;
                break;
            case 'silhouette':
                overrideMat = this.silhouetteMaterial;
                break;
            case 'uv':
                overrideMat = this._getUVMaterial();
                break;
            case 'matcap':
                overrideMat = this._getMatcapMaterial();
                break;
            case 'ao':
                overrideMat = this._getAOMaterial();
                break;
        }

        if (overrideMat) {
            this.scene.traverse((child) => {
                if (child.isMesh) {
                    child.material = overrideMat;
                }
            });
        }
    }

    /**
     * Capture a specific render pass to a canvas/blob
     */
    capturePass(type, width, height) {
        const renderTarget = new THREE.WebGLRenderTarget(width, height, {
            minFilter: THREE.LinearFilter,
            magFilter: THREE.LinearFilter,
            format: THREE.RGBAFormat,
            type: THREE.UnsignedByteType,
        });

        // Save current state
        const origBg = this.scene.background;
        const origTarget = this.renderer.getRenderTarget();
        const origSize = new THREE.Vector2();
        this.renderer.getSize(origSize);

        // Setup for capture
        this.renderer.setSize(width, height);
        this.renderer.setRenderTarget(renderTarget);

        // Apply material override
        if (type !== 'color') {
            this._saveMaterials();
            let mat = null;
            switch (type) {
                case 'depth': mat = this._createDepthVisMaterial(); break;
                case 'normal': mat = this.normalMaterial; break;
                case 'wireframe': mat = this.wireframeMaterial; break;
                case 'ao_silhouette': mat = this.silhouetteMaterial; break;
            }
            if (mat) {
                this.scene.traverse((child) => {
                    if (child.isMesh) child.material = mat;
                });
            }
            if (type === 'depth' || type === 'ao_silhouette') {
                this.scene.background = new THREE.Color(0x000000);
            }
        }

        // Render
        this.renderer.render(this.scene, this.camera);

        // Read pixels
        const buffer = new Uint8Array(width * height * 4);
        this.renderer.readRenderTargetPixels(renderTarget, 0, 0, width, height, buffer);

        // Restore
        if (type !== 'color') {
            this._restoreMaterials();
        }
        this.scene.background = origBg;
        this.renderer.setRenderTarget(origTarget);
        this.renderer.setSize(origSize.x, origSize.y);
        renderTarget.dispose();

        // Convert to canvas (flipped vertically)
        return this._bufferToCanvas(buffer, width, height);
    }

    _bufferToCanvas(buffer, width, height) {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        const imageData = ctx.createImageData(width, height);

        // Flip vertically (WebGL origin is bottom-left)
        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const srcIdx = ((height - 1 - y) * width + x) * 4;
                const dstIdx = (y * width + x) * 4;
                imageData.data[dstIdx] = buffer[srcIdx];
                imageData.data[dstIdx + 1] = buffer[srcIdx + 1];
                imageData.data[dstIdx + 2] = buffer[srcIdx + 2];
                imageData.data[dstIdx + 3] = buffer[srcIdx + 3];
            }
        }
        ctx.putImageData(imageData, 0, 0);
        return canvas;
    }

    _saveMaterials() {
        this.originalMaterials.clear();
        this.scene.traverse((child) => {
            if (child.isMesh) {
                this.originalMaterials.set(child.uuid, child.material);
            }
        });
    }

    _restoreMaterials() {
        if (this.originalMaterials.size === 0) return;
        this.scene.traverse((child) => {
            if (child.isMesh && this.originalMaterials.has(child.uuid)) {
                child.material = this.originalMaterials.get(child.uuid);
            }
        });
        this.originalMaterials.clear();
    }

    _createDepthVisMaterial() {
        return new THREE.ShaderMaterial({
            vertexShader: `
                varying float vDepth;
                void main() {
                    vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                    vDepth = -mvPos.z;
                    gl_Position = projectionMatrix * mvPos;
                }
            `,
            fragmentShader: `
                varying float vDepth;
                uniform float cameraNear;
                uniform float cameraFar;
                void main() {
                    float depth = (vDepth - cameraNear) / (cameraFar - cameraNear);
                    depth = 1.0 - clamp(depth, 0.0, 1.0);
                    gl_FragColor = vec4(vec3(depth), 1.0);
                }
            `,
            uniforms: {
                cameraNear: { value: this.camera.near },
                cameraFar: { value: this.camera.far },
            }
        });
    }

    _getUVMaterial() {
        if (!this.uvMaterial) {
            this.uvMaterial = new THREE.ShaderMaterial({
                vertexShader: `
                    varying vec2 vUv;
                    void main() {
                        vUv = uv;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    varying vec2 vUv;
                    void main() {
                        gl_FragColor = vec4(vUv.x, vUv.y, 0.0, 1.0);
                    }
                `,
            });
        }
        return this.uvMaterial;
    }

    _getMatcapMaterial() {
        if (!this.matcapMaterial) {
            // Generate a simple matcap-like material using normals
            this.matcapMaterial = new THREE.ShaderMaterial({
                vertexShader: `
                    varying vec3 vNormal;
                    varying vec3 vViewPosition;
                    void main() {
                        vNormal = normalize(normalMatrix * normal);
                        vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
                        vViewPosition = -mvPos.xyz;
                        gl_Position = projectionMatrix * mvPos;
                    }
                `,
                fragmentShader: `
                    varying vec3 vNormal;
                    varying vec3 vViewPosition;
                    void main() {
                        vec3 n = normalize(vNormal);
                        vec3 v = normalize(vViewPosition);
                        float fresnel = pow(1.0 - max(dot(n, v), 0.0), 2.0);
                        vec3 warmColor = vec3(0.85, 0.75, 0.65);
                        vec3 coolColor = vec3(0.3, 0.35, 0.5);
                        vec3 color = mix(warmColor, coolColor, fresnel);
                        float diffuse = max(dot(n, normalize(vec3(0.5, 1.0, 0.3))), 0.0);
                        color *= 0.5 + 0.5 * diffuse;
                        gl_FragColor = vec4(color, 1.0);
                    }
                `,
            });
        }
        return this.matcapMaterial;
    }

    _getAOMaterial() {
        if (!this.aoMaterial) {
            this.aoMaterial = new THREE.ShaderMaterial({
                vertexShader: `
                    varying vec3 vNormal;
                    varying vec3 vPosition;
                    void main() {
                        vNormal = normalize(normalMatrix * normal);
                        vPosition = (modelViewMatrix * vec4(position, 1.0)).xyz;
                        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
                    }
                `,
                fragmentShader: `
                    varying vec3 vNormal;
                    varying vec3 vPosition;
                    void main() {
                        vec3 n = normalize(vNormal);
                        float ao = 0.5 + 0.5 * n.y; // Simple cavity-based AO approximation
                        float edge = 1.0 - abs(dot(n, normalize(-vPosition)));
                        ao *= 1.0 - 0.3 * edge;
                        gl_FragColor = vec4(vec3(ao), 1.0);
                    }
                `,
            });
        }
        return this.aoMaterial;
    }

    dispose() {
        this._restoreMaterials();
        this.depthMaterial.dispose();
        this.normalMaterial.dispose();
        this.wireframeMaterial.dispose();
        this.silhouetteMaterial.dispose();
        if (this.uvMaterial) this.uvMaterial.dispose();
        if (this.matcapMaterial) this.matcapMaterial.dispose();
        if (this.aoMaterial) this.aoMaterial.dispose();
    }
}
