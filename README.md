# 🎮 ComfyUI-3D-Viewer-Pro


A professional-grade, high-performance 3D model viewer and multi-pass rendering engine for **ComfyUI**. Built with **Three.js**, this extension provides a seamless bridge between 3D assets and AI workflows (ControlNet, IP-Adapter, Stable Diffusion).

## ✨ Key Features

### 🚀 Advanced Viewport
- **Interactive Orbit Controls** - Rotate, pan, and zoom with buttery-smooth damping.
- **Glassmorphic UI** - Minimalistic, high-end interface that fits perfectly into the ComfyUI aesthetic.
- **Transform Gizmos** - Move, Rotate, and Scale models directly in the viewport with **Local/World Space** toggling.
- **Auto-Fit & Centering** - Instantly frame your model regardless of its original coordinates or scale.
- **Dynamic FOV** - Adjust Focal Length (mm) and watch the lens compression update in real-time.
- **Background Removal** - Drop in background images for ref-alignment or clear them with one click.

### 🖼️ Professional Multi-Pass Rendering
Generate 6 distinct feature maps from your 3D view in a single execution:
1. **Color** - Full PBR lighting/texture render.
2. **Depth Map** - High-precision Z-depth for ControlNet.
3. **Normal Map** - View-space surface normals.
4. **Wireframe** - Clean technical wireframe overlay.
5. **AO / Silhouette** - Ambient occlusion and contrasty silhouette.
6. **Native MASK** - Outputs a true black/white `MASK` tensor for native ComfyUI masking nodes.

### 🔄 Turntable 3D Pro
- Render full 360° spinning image batches.
- Perfect for **AnimateDiff**, **ControlNet Multi-view**, or product showcases.
- Frame count, pitch, FOV, and render mode customization.

### 🛠️ Technical Excellence
- **Zero-Latency Auto-Load** - Upload a model run the node once and it loads in the viewer instantly, you can then select which model to choose from the drop down list.
- **Pure Output Renders** - Automatically forces "Flat Base" lighting during render to guarantee clean, shadow-free feature maps for AI conditioning.
- **RGBA Transparency** - Full support for transparent background renders with native Alpha channels.
- **OS Scaling Fix** - Built-in bypass for Windows DPI scaling ensures your 1024x1024 render is *exactly* 1024x1024 pixels.

## 📦 Installation

### Method 1: Git Clone (Recommended)
1. Navigate to your `ComfyUI/custom_nodes/` folder in a terminal.
2. Run the following command:
```bash
git clone https://github.com/your-username/comfyui-3d-viewer-pro
```

### Method 2: Manual Installation
1. Download this repository as a **ZIP** file from GitHub.
2. Extract the contents into your `ComfyUI/custom_nodes/` directory.
3. Ensure the folder is named `comfyui-3d-viewer-pro`.

### Final Step: Install Dependencies
Open your terminal in the `comfyui-3d-viewer-pro` folder and run:
```bash
pip install -r requirements.txt
```

### Step 3: Restart ComfyUI
Launch ComfyUI and find the nodes under the **"3D Viewer Pro"** category.

## 📦 Requirements & Dependencies
- **No Internet Required**: All Three.js libraries (r170) are fully bundled locally.
- **Python**: Uses standard ComfyUI dependencies (`torch`, `numpy`, `Pillow`). No specialized 3D libraries need to be installed on your OS.

## 📁 Model Directory & Assets
Place your 3D model files in the following directory:
```bash
ComfyUI/input/3d/
```
Alternately, you can:
- Use the **📂 Upload 3D Model** button directly on the node.
- Provide an **absolute file path** via the `custom_path` input field.

-*NOTE* - YOU NEED TO RUN THE NODE ONCE AFTER YOU LOAD A 3D MODEL USING THE UPLOAD 3D MODEL BUTTON - AFTER THAT YOU CAN JUST SELECT THE MODELS FROM THE DROP DOWN LIST

## 📜 Credits & License
- Built with [Three.js](https://threejs.org/)
- UI inspired by modern creative suites.
- Licensed under the **MIT License**.
