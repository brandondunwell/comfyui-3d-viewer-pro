/**
 * UIOverlay.js — Toolbar, status bar, and panels for the 3D viewer
 */

export class UIOverlay {
    constructor(container) {
        this.container = container;
        this.toolbar = null;
        this.statusBar = null;
        this.sidePanel = null;
        this.callbacks = {};
        this._build();
    }

    on(event, callback) {
        this.callbacks[event] = callback;
    }

    _emit(event, data) {
        if (this.callbacks[event]) this.callbacks[event](data);
    }

    _build() {
        // ── Top Toolbar ──
        this.toolbar = document.createElement('div');
        this.toolbar.className = 'v3d-toolbar';
        this.toolbar.innerHTML = `
            <div class="v3d-toolbar-group">
                <label class="v3d-label">Mode</label>
                <select class="v3d-select" id="v3d-render-mode">
                    <option value="color">Color</option>
                    <option value="wireframe">Wireframe</option>
                    <option value="normal">Normal</option>
                    <option value="depth">Depth</option>
                    <option value="matcap">Matcap</option>
                    <option value="ao">AO</option>
                    <option value="uv">UV</option>
                    <option value="silhouette">Silhouette</option>
                </select>
            </div>
            <div class="v3d-toolbar-group">
                <label class="v3d-label">Camera</label>
                <select class="v3d-select" id="v3d-camera-preset">
                    <option value="">Free</option>
                    <option value="front">Front</option>
                    <option value="back">Back</option>
                    <option value="left">Left</option>
                    <option value="right">Right</option>
                    <option value="top">Top</option>
                    <option value="bottom">Bottom</option>
                    <option value="isometric">Isometric</option>
                    <option value="three_quarter">¾ View</option>
                </select>
            </div>
            <div class="v3d-toolbar-group">
                <label class="v3d-label">Light</label>
                <select class="v3d-select" id="v3d-lighting-preset">
                    <option value="studio">Studio</option>
                    <option value="outdoor">Outdoor</option>
                    <option value="dramatic">Dramatic</option>
                    <option value="flat">Flat</option>
                    <option value="rim">Rim</option>
                </select>
            </div>
            <div class="v3d-toolbar-group v3d-toolbar-actions">
                <button class="v3d-btn" id="v3d-btn-grid" title="Toggle Grid">⊞</button>
                <button class="v3d-btn" id="v3d-btn-axes" title="Toggle Axes">⊹</button>
                <button class="v3d-btn" id="v3d-btn-fit" title="Zoom to Fit">⊡</button>
                <button class="v3d-btn" id="v3d-btn-screenshot" title="Screenshot">📷</button>
                <button class="v3d-btn" id="v3d-btn-fullscreen" title="Fullscreen">⛶</button>
            </div>
        `;
        this.container.appendChild(this.toolbar);

        // ── Animation bar (hidden by default) ──
        this.animBar = document.createElement('div');
        this.animBar.className = 'v3d-anim-bar v3d-hidden';
        this.animBar.innerHTML = `
            <button class="v3d-btn v3d-btn-sm" id="v3d-anim-play">▶</button>
            <button class="v3d-btn v3d-btn-sm" id="v3d-anim-stop">◼</button>
            <input type="range" class="v3d-slider" id="v3d-anim-scrub" min="0" max="100" value="0" />
            <select class="v3d-select v3d-select-sm" id="v3d-anim-clip"></select>
            <span class="v3d-label" id="v3d-anim-time">0.00s</span>
        `;
        this.container.appendChild(this.animBar);

        // ── Status Bar ──
        this.statusBar = document.createElement('div');
        this.statusBar.className = 'v3d-status-bar';
        this.statusBar.innerHTML = `
            <span id="v3d-status-verts">Verts: —</span>
            <span id="v3d-status-faces">Faces: —</span>
            <span id="v3d-status-dims">Size: —</span>
            <span id="v3d-status-fps" class="v3d-status-right">FPS: —</span>
        `;
        this.container.appendChild(this.statusBar);

        // ── Loading overlay ──
        this.loadingOverlay = document.createElement('div');
        this.loadingOverlay.className = 'v3d-loading v3d-hidden';
        this.loadingOverlay.innerHTML = `
            <div class="v3d-loading-inner">
                <div class="v3d-spinner"></div>
                <span id="v3d-loading-text">Loading model...</span>
                <div class="v3d-progress-bar"><div class="v3d-progress-fill" id="v3d-progress"></div></div>
            </div>
        `;
        this.container.appendChild(this.loadingOverlay);

        this._bindEvents();
    }

    _bindEvents() {
        const $ = (id) => this.container.querySelector('#' + id);

        $('v3d-render-mode')?.addEventListener('change', (e) => this._emit('renderMode', e.target.value));
        $('v3d-camera-preset')?.addEventListener('change', (e) => {
            if (e.target.value) this._emit('cameraPreset', e.target.value);
            e.target.value = '';
        });
        $('v3d-lighting-preset')?.addEventListener('change', (e) => this._emit('lightingPreset', e.target.value));
        $('v3d-btn-grid')?.addEventListener('click', () => this._emit('toggleGrid'));
        $('v3d-btn-axes')?.addEventListener('click', () => this._emit('toggleAxes'));
        $('v3d-btn-fit')?.addEventListener('click', () => this._emit('zoomToFit'));
        $('v3d-btn-screenshot')?.addEventListener('click', () => this._emit('screenshot'));
        $('v3d-btn-fullscreen')?.addEventListener('click', () => this._emit('fullscreen'));

        // Animation controls
        $('v3d-anim-play')?.addEventListener('click', () => this._emit('animPlay'));
        $('v3d-anim-stop')?.addEventListener('click', () => this._emit('animStop'));
        $('v3d-anim-scrub')?.addEventListener('input', (e) => this._emit('animScrub', parseFloat(e.target.value)));
        $('v3d-anim-clip')?.addEventListener('change', (e) => this._emit('animClip', parseInt(e.target.value)));
    }

    setRenderMode(mode) {
        const sel = this.container.querySelector('#v3d-render-mode');
        if (sel) sel.value = mode;
    }

    setLightingPreset(preset) {
        const sel = this.container.querySelector('#v3d-lighting-preset');
        if (sel) sel.value = preset;
    }

    updateModelInfo(info) {
        const $ = (id) => this.container.querySelector('#' + id);
        if (info) {
            $('v3d-status-verts').textContent = `Verts: ${info.vertexCount.toLocaleString()}`;
            $('v3d-status-faces').textContent = `Faces: ${info.faceCount.toLocaleString()}`;
            $('v3d-status-dims').textContent = `Size: ${info.dimensions.x}×${info.dimensions.y}×${info.dimensions.z}`;
        }
    }

    updateFPS(fps) {
        const el = this.container.querySelector('#v3d-status-fps');
        if (el) el.textContent = `FPS: ${Math.round(fps)}`;
    }

    showAnimationControls(clipNames) {
        this.animBar.classList.remove('v3d-hidden');
        const select = this.container.querySelector('#v3d-anim-clip');
        if (select) {
            select.innerHTML = clipNames.map((name, i) => `<option value="${i}">${name}</option>`).join('');
        }
    }

    hideAnimationControls() {
        this.animBar.classList.add('v3d-hidden');
    }

    updateAnimationTime(time, duration) {
        const scrub = this.container.querySelector('#v3d-anim-scrub');
        const label = this.container.querySelector('#v3d-anim-time');
        if (scrub && duration > 0) scrub.value = (time / duration) * 100;
        if (label) label.textContent = `${time.toFixed(2)}s / ${duration.toFixed(2)}s`;
    }

    showLoading(text = 'Loading model...') {
        this.loadingOverlay.classList.remove('v3d-hidden');
        const el = this.container.querySelector('#v3d-loading-text');
        if (el) el.textContent = text;
    }

    hideLoading() {
        this.loadingOverlay.classList.add('v3d-hidden');
    }

    setProgress(fraction) {
        const el = this.container.querySelector('#v3d-progress');
        if (el) el.style.width = `${Math.round(fraction * 100)}%`;
    }

    dispose() {
        if (this.toolbar) this.toolbar.remove();
        if (this.statusBar) this.statusBar.remove();
        if (this.animBar) this.animBar.remove();
        if (this.loadingOverlay) this.loadingOverlay.remove();
    }
}
