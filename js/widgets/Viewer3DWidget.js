/**
 * Viewer3DWidget.js — LiteGraph custom widget that embeds the 3D viewer into a ComfyUI node
 */
import { ViewerApp } from '../viewer/ViewerApp.js';

export class Viewer3DWidget {
    constructor(node, options = {}) {
        this.node = node;
        this.viewer = null;
        this.container = null;
        this.isInitialized = false;
        this.currentModelUrl = null;
        this.viewerWidth = options.width || 512;
        this.viewerHeight = options.height || 512;

        this._createWidget();
    }

    _createWidget() {
        // Create the widget container
        this.container = document.createElement('div');
        this.container.className = 'v3d-widget-container';
        this.container.style.width = `${this.viewerWidth}px`;
        this.container.style.height = `${this.viewerHeight + 80}px`; // Extra for toolbar+status

        // Add the widget to the node
        const widget = this.node.addDOMWidget('viewer3d', 'customWidget', this.container, {
            serialize: false,
            hideOnZoom: false,
        });

        // Adjust node size
        this.node.setSize([
            Math.max(this.viewerWidth + 40, 300),
            this.viewerHeight + 200
        ]);

        // Watch for node resize
        const origOnResize = this.node.onResize;
        this.node.onResize = (size) => {
            if (origOnResize) origOnResize.call(this.node, size);
            this._onNodeResize(size);
        };

        return widget;
    }

    /**
     * Initialize the Three.js viewer inside the widget container
     */
    init() {
        if (this.isInitialized) return;

        this.viewer = new ViewerApp(this.container, {
            width: this.viewerWidth,
            height: this.viewerHeight,
            showUI: true,
        });

        this.isInitialized = true;
    }

    /**
     * Load a model into the viewer
     */
    async loadModel(modelData) {
        if (!this.isInitialized) this.init();

        const { path, format, settings, serve_mode } = modelData;

        // Build URL based on serve mode
        let url;
        if (serve_mode === 'temp') {
            url = `/viewer3d/model/../temp/viewer3d_models/${path}`;
        } else {
            url = `/viewer3d/model/${path}`;
        }

        // Don't reload if same model
        if (this.currentModelUrl === url) return;
        this.currentModelUrl = url;

        await this.viewer.loadModel(url, format, settings);
    }

    /**
     * Apply viewer settings from the node inputs
     */
    applySettings(viewerSettings) {
        if (!this.viewer) return;

        if (viewerSettings.render_mode) {
            this.viewer.setRenderMode(viewerSettings.render_mode);
        }
        if (viewerSettings.bg_color) {
            this.viewer.setBackground(viewerSettings.bg_color);
        }
        if (viewerSettings.show_grid !== undefined) {
            this.viewer.showGrid = viewerSettings.show_grid;
            this.viewer.sceneManager.setupGrid(viewerSettings.show_grid);
        }
        if (viewerSettings.show_axes !== undefined) {
            this.viewer.showAxes = viewerSettings.show_axes;
            this.viewer.sceneManager.setupAxes(viewerSettings.show_axes);
        }
        if (viewerSettings.lighting_preset) {
            this.viewer.lightingManager.setPreset(viewerSettings.lighting_preset);
            if (this.viewer.ui) this.viewer.ui.setLightingPreset(viewerSettings.lighting_preset);
        }
        if (viewerSettings.camera_preset && viewerSettings.camera_preset !== 'default') {
            const box = this.viewer.modelLoader.getBoundingBox();
            this.viewer.cameraController.setPreset(viewerSettings.camera_preset, box);
        }
        if (viewerSettings.ground_shadow !== undefined) {
            this.viewer.sceneManager.setupGroundShadow(viewerSettings.ground_shadow);
        }
    }

    /**
     * Resize the viewer to match node dimensions
     */
    _onNodeResize(size) {
        if (!this.viewer) return;
        const newWidth = Math.max(size[0] - 40, 256);
        const newHeight = Math.max(size[1] - 200, 256);
        if (newWidth !== this.viewerWidth || newHeight !== this.viewerHeight) {
            this.viewerWidth = newWidth;
            this.viewerHeight = newHeight;
            this.container.style.width = `${newWidth}px`;
            this.container.style.height = `${newHeight + 80}px`;
            this.viewer.resize(newWidth, newHeight);
        }
    }

    /**
     * Capture render passes and save them to the server
     */
    async captureAndSavePasses(config) {
        if (!this.viewer) return;

        const { width, height, passes, output_dir, unique_id,
                camera, lighting_preset, bg_color, bg_transparent } = config;

        // Set camera
        if (camera) {
            this.viewer.cameraController.setCameraFromAngles(
                camera.yaw, camera.pitch, camera.distance, camera.fov
            );
        }

        // Set lighting
        if (lighting_preset) {
            this.viewer.lightingManager.setPreset(lighting_preset);
        }

        // Set background
        this.viewer.setBackground(bg_color || '#000000', bg_transparent || false);

        // Hide helpers for clean render
        this.viewer.sceneManager.setupGrid(false);
        this.viewer.sceneManager.setupAxes(false);

        // Render each pass
        const passNames = passes === 'all'
            ? ['color', 'depth', 'normal', 'wireframe', 'ao_silhouette']
            : [passes.replace('_only', '')];

        const allPassNames = ['color', 'depth', 'normal', 'wireframe', 'ao_silhouette'];

        for (const passName of allPassNames) {
            const canvas = this.viewer.capturePass(passName, width, height);
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const formData = new FormData();
            formData.append('file', blob, `viewer3d_${unique_id}_${passName}.png`);
            formData.append('subfolder', '');
            formData.append('type', 'temp');

            await fetch('/upload/image', { method: 'POST', body: formData });
        }

        // Restore helpers
        this.viewer.sceneManager.setupGrid(this.viewer.showGrid);
        this.viewer.sceneManager.setupAxes(this.viewer.showAxes);

        // Signal completion
        await fetch('/viewer3d/render_complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unique_id }),
        });
    }

    /**
     * Render turntable frames and upload them
     */
    async captureAndSaveTurntable(config) {
        if (!this.viewer) return;

        const turntable = config.turntable;

        // Set lighting
        this.viewer.lightingManager.setPreset(turntable.lighting_preset || 'studio');
        this.viewer.setBackground(turntable.bg_color || '#000000', turntable.bg_transparent || false);
        this.viewer.sceneManager.setupGrid(false);
        this.viewer.sceneManager.setupAxes(false);

        const frames = await this.viewer.renderTurntable(turntable);

        // Upload each frame
        for (let i = 0; i < frames.length; i++) {
            const canvas = frames[i];
            const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
            const formData = new FormData();
            formData.append('file', blob, `viewer3d_${turntable.unique_id}_turntable_${String(i).padStart(4, '0')}.png`);
            formData.append('subfolder', '');
            formData.append('type', 'temp');

            await fetch('/upload/image', { method: 'POST', body: formData });
        }

        // Restore
        this.viewer.sceneManager.setupGrid(this.viewer.showGrid);
        this.viewer.sceneManager.setupAxes(this.viewer.showAxes);

        // Signal completion
        await fetch('/viewer3d/render_complete', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ unique_id: turntable.unique_id }),
        });
    }

    dispose() {
        if (this.viewer) {
            this.viewer.dispose();
            this.viewer = null;
        }
        this.isInitialized = false;
        this.currentModelUrl = null;
    }
}
