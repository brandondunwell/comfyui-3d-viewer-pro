/**
 * ViewerApp.js — Core 3D viewer application
 * Orchestrates scene, camera, model loading, render passes, lighting, animation, and UI.
 */
import * as THREE from '../lib/three.module.min.js';
import { SceneManager } from './SceneManager.js';
import { CameraController } from './CameraController.js';
import { ModelLoader } from './ModelLoader.js';
import { RenderPassManager } from './RenderPassManager.js';
import { LightingManager } from './LightingManager.js';
import { AnimationManager } from './AnimationManager.js';
import { UIOverlay } from './UIOverlay.js';

export class ViewerApp {
    constructor(container, options = {}) {
        this.container = container;
        this.options = {
            width: options.width || 512,
            height: options.height || 512,
            showUI: options.showUI !== false,
            antialias: options.antialias !== false,
        };

        this.currentModel = null;
        this.currentRenderMode = 'color';
        this.showGrid = true;
        this.showAxes = true;
        this.isFullscreen = false;
        this.fpsCounter = { frames: 0, lastTime: performance.now(), fps: 60 };
        this.animationFrameId = null;

        this._init();
    }

    _init() {
        // Container setup
        this.container.style.position = 'relative';
        this.container.style.overflow = 'hidden';

        // Canvas wrapper
        this.canvasWrapper = document.createElement('div');
        this.canvasWrapper.className = 'v3d-canvas-wrapper';
        this.canvasWrapper.style.width = `${this.options.width}px`;
        this.canvasWrapper.style.height = `${this.options.height}px`;
        this.container.appendChild(this.canvasWrapper);

        // Renderer
        this.renderer = new THREE.WebGLRenderer({
            antialias: this.options.antialias,
            alpha: true,
            preserveDrawingBuffer: true,
        });
        this.renderer.setSize(this.options.width, this.options.height);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.canvasWrapper.appendChild(this.renderer.domElement);

        // Scene
        this.scene = new THREE.Scene();

        // Camera
        this.camera = new THREE.PerspectiveCamera(50, this.options.width / this.options.height, 0.01, 1000);
        this.camera.position.set(2, 1.5, 2.5);

        // Sub-managers
        this.sceneManager = new SceneManager(this.scene);
        this.cameraController = new CameraController(this.camera, this.renderer.domElement);
        this.modelLoader = new ModelLoader();
        this.renderPassManager = new RenderPassManager(this.renderer, this.scene, this.camera);
        this.lightingManager = new LightingManager(this.scene);
        this.animationManager = new AnimationManager();

        // Setup defaults
        this.sceneManager.setBackground('#1a1a2e');
        this.sceneManager.setupGrid(true);
        this.sceneManager.setupAxes(true);
        this.lightingManager.setPreset('studio');

        // UI
        if (this.options.showUI) {
            this.ui = new UIOverlay(this.container);
            this._bindUI();
        }

        // Start render loop
        this._animate();
    }

    _bindUI() {
        if (!this.ui) return;

        this.ui.on('renderMode', (mode) => this.setRenderMode(mode));
        this.ui.on('cameraPreset', (preset) => {
            // Scene cameras embedded in the file use a 'scene_camera_N' prefix
            if (preset.startsWith('scene_camera_')) {
                const idx = parseInt(preset.replace('scene_camera_', ''), 10);
                const cam = this.modelLoader.sceneCameras?.[idx];
                if (cam) this.cameraController.applySceneCamera(cam.object);
            } else {
                const box = this.modelLoader.getBoundingBox();
                this.cameraController.setPreset(preset, box);
            }
        });
        this.ui.on('lightingPreset', (preset) => this.lightingManager.setPreset(preset));
        this.ui.on('toggleGrid', () => {
            this.showGrid = !this.showGrid;
            this.sceneManager.setupGrid(this.showGrid);
        });
        this.ui.on('toggleAxes', () => {
            this.showAxes = !this.showAxes;
            this.sceneManager.setupAxes(this.showAxes);
        });
        this.ui.on('zoomToFit', () => {
            const box = this.modelLoader.getBoundingBox();
            if (box) this.cameraController.zoomToFit(box);
        });
        this.ui.on('screenshot', () => this.takeScreenshot());
        this.ui.on('fullscreen', () => this.toggleFullscreen());

        // Animation controls
        this.ui.on('animPlay', () => {
            if (this.animationManager.isPlaying) {
                this.animationManager.pause();
            } else {
                this.animationManager.play();
            }
        });
        this.ui.on('animStop', () => this.animationManager.stop());
        this.ui.on('animScrub', (pct) => {
            const time = (pct / 100) * this.animationManager.duration;
            this.animationManager.setTime(time);
        });
        this.ui.on('animClip', (idx) => {
            this.animationManager.play(idx);
        });
    }

    /**
     * Load a 3D model into the viewer
     */
    async loadModel(url, format, settings = {}) {
        // Show loading
        if (this.ui) this.ui.showLoading(`Loading ${format.toUpperCase()} model...`);

        // Remove previous model
        if (this.currentModel) {
            this.scene.remove(this.currentModel);
            this.modelLoader.dispose();
            this.animationManager.dispose();
        }

        try {
            const result = await this.modelLoader.load(
                url, format, settings,
                (progress) => { if (this.ui) this.ui.setProgress(progress); }
            );

            this.currentModel = result.model;
            this.scene.add(this.currentModel);

            // Update camera to fit model
            const box = this.modelLoader.getBoundingBox();
            if (box) this.cameraController.zoomToFit(box);

            // Setup animation if available
            if (result.animations && result.animations.length > 0) {
                const hasAnims = this.animationManager.setup(this.currentModel, result.animations);
                if (hasAnims && this.ui) {
                    this.ui.showAnimationControls(this.animationManager.getClipNames());
                }
            } else {
                if (this.ui) this.ui.hideAnimationControls();
            }

            // Populate scene cameras in the Camera dropdown if the file had any
            if (this.ui) {
                const sceneCams = this.modelLoader.sceneCameras;
                if (sceneCams && sceneCams.length > 0) {
                    this.ui.populateSceneCameras(sceneCams.map(c => c.name));
                } else {
                    this.ui.clearSceneCameras();
                }
            }

            // Update UI info
            if (this.ui && result.info) {
                this.ui.updateModelInfo(result.info);
            }

            // Update ground shadow
            this.sceneManager.setupGroundShadow(true);

        } catch (error) {
            console.error('[3D Viewer Pro] Failed to load model:', error);
            if (this.ui) this.ui.showLoading(`Error: ${error.message}`);
            setTimeout(() => { if (this.ui) this.ui.hideLoading(); }, 3000);
            return;
        }

        if (this.ui) this.ui.hideLoading();
    }

    setRenderMode(mode) {
        this.currentRenderMode = mode;
        this.renderPassManager.setRenderMode(mode);
        if (this.ui) this.ui.setRenderMode(mode);
    }

    setBackground(color, transparent = false) {
        this.sceneManager.setBackground(color, transparent);
    }

    resize(width, height) {
        this.options.width = width;
        this.options.height = height;
        this.canvasWrapper.style.width = `${width}px`;
        this.canvasWrapper.style.height = `${height}px`;
        this.camera.aspect = width / height;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(width, height);
    }

    /**
     * Capture current view as a PNG blob
     */
    async takeScreenshot() {
        this.renderer.render(this.scene, this.camera);
        const dataUrl = this.renderer.domElement.toDataURL('image/png');

        // Download
        const link = document.createElement('a');
        link.download = `3d_viewer_screenshot_${Date.now()}.png`;
        link.href = dataUrl;
        link.click();

        return dataUrl;
    }

    /**
     * Capture a specific render pass to a canvas
     */
    capturePass(passType, width, height) {
        return this.renderPassManager.capturePass(passType, width || this.options.width, height || this.options.height);
    }

    /**
     * Capture all passes and return as an object of canvases
     */
    captureAllPasses(width, height) {
        const w = width || this.options.width;
        const h = height || this.options.height;
        return {
            color: this.renderPassManager.capturePass('color', w, h),
            depth: this.renderPassManager.capturePass('depth', w, h),
            normal: this.renderPassManager.capturePass('normal', w, h),
            wireframe: this.renderPassManager.capturePass('wireframe', w, h),
            ao_silhouette: this.renderPassManager.capturePass('ao_silhouette', w, h),
        };
    }

    /**
     * Render turntable frames
     */
    async renderTurntable(config) {
        const { width, height, angles, pitch, distance, fov, render_mode, lighting_preset, bg_color, bg_transparent } = config;

        // Set lighting
        this.lightingManager.setPreset(lighting_preset || 'studio');
        this.sceneManager.setBackground(bg_color || '#000000', bg_transparent || false);

        // Hide UI elements for clean render
        this.sceneManager.setupGrid(false);
        this.sceneManager.setupAxes(false);

        if (render_mode && render_mode !== 'color') {
            this.renderPassManager.setRenderMode(render_mode);
        }

        const frames = [];
        const target = this.cameraController.controls.target.clone();

        for (let i = 0; i < angles.length; i++) {
            this.cameraController.setCameraFromAngles(angles[i], pitch, distance, fov);
            const canvas = this.renderPassManager.capturePass(
                render_mode === 'color' ? 'color' : render_mode,
                width, height
            );
            frames.push(canvas);
        }

        // Restore
        if (render_mode && render_mode !== 'color') {
            this.renderPassManager.setRenderMode('color');
        }
        this.sceneManager.setupGrid(this.showGrid);
        this.sceneManager.setupAxes(this.showAxes);

        return frames;
    }

    toggleFullscreen() {
        if (!this.isFullscreen) {
            this._savedSize = {
                width: this.options.width,
                height: this.options.height,
            };
            this.container.classList.add('v3d-fullscreen');
            this.resize(window.innerWidth, window.innerHeight);
            this.isFullscreen = true;
        } else {
            this.container.classList.remove('v3d-fullscreen');
            this.resize(this._savedSize.width, this._savedSize.height);
            this.isFullscreen = false;
        }
    }

    _animate() {
        this.animationFrameId = requestAnimationFrame(() => this._animate());

        // Update controllers
        this.cameraController.update();
        this.animationManager.update();

        // Update animation UI
        if (this.ui && this.animationManager.hasAnimations()) {
            this.ui.updateAnimationTime(this.animationManager.currentTime, this.animationManager.duration);
        }

        // Render
        this.renderer.render(this.scene, this.camera);

        // FPS counter
        this.fpsCounter.frames++;
        const now = performance.now();
        if (now - this.fpsCounter.lastTime >= 1000) {
            this.fpsCounter.fps = this.fpsCounter.frames * 1000 / (now - this.fpsCounter.lastTime);
            this.fpsCounter.frames = 0;
            this.fpsCounter.lastTime = now;
            if (this.ui) this.ui.updateFPS(this.fpsCounter.fps);
        }
    }

    dispose() {
        if (this.animationFrameId) cancelAnimationFrame(this.animationFrameId);
        this.sceneManager.dispose();
        this.cameraController.dispose();
        this.modelLoader.dispose();
        this.renderPassManager.dispose();
        this.lightingManager.dispose();
        this.animationManager.dispose();
        if (this.ui) this.ui.dispose();
        this.renderer.dispose();
        if (this.canvasWrapper) this.canvasWrapper.remove();
    }
}
