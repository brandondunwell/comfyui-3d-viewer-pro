# 🎮 ComfyUI-3D-Viewer-Pro

A professional-grade, high-performance 3D model viewer and multi-pass rendering engine for **ComfyUI**. Built with **Three.js**, this extension provides a seamless bridge between 3D assets and AI workflows (ControlNet, IP-Adapter, Stable Diffusion).

### 📦 Supported Formats
Supports all major 3D industry standards:
- **GLB / GLTF** (Recommended for performance/shading)
- **OBJ** (Standard geometry)
- **FBX** (Complex scenes & animation)
- **STL** (3D printing/sculpting)

---

## ✨ Visual Showcase & Features

### 🚀 Zero-Latency Auto-Load
Upload a model or run the node once, and it loads in the viewer instantly. After the initial load, seamlessly switch between models using the dropdown list for immediate previews.

https://github.com/user-attachments/assets/0e3d27d5-9cb9-4e02-8d16-23ebf46d6f2d

### 🎛️ Transform Gizmos & Glassmorphic UI
Move, rotate, and scale models directly in the interactive viewport with **Local/World Space** toggling using professional 3D gizmos. All of this is housed in a minimalistic, glassmorphic UI that fits perfectly into the ComfyUI aesthetic.

![Gizmo Support](https://github.com/user-attachments/assets/6172ef0a-4ae9-4723-930f-d1eb198e9c89)

### 🎥 Dynamic FOV & Camera Controls
Adjust the Focal Length (mm) and watch the lens compression update in real-time. Features buttery-smooth damping for panning, zooming, and orbiting.

https://github.com/user-attachments/assets/56e8b1b2-ea53-4d95-8e9a-446c7fee15c2

### 🖼️ Professional Multi-Pass Rendering
Generate up to 6 distinct feature maps from your 3D view in a single execution:
1. **Color** - Full PBR lighting/texture render.
2. **Depth Map** - High-precision Z-depth for ControlNet.
3. **Normal Map** - View-space surface normals.
4. **Wireframe** - Clean technical wireframe overlay.
5. **AO / Silhouette** - Ambient occlusion and contrasty silhouette.
6. **Native MASK** - Outputs a true black/white `MASK` tensor for ComfyUI.

![Render Passes](https://github.com/user-attachments/assets/064381d1-ddba-4025-bb29-834edeb3a2c5)

### 🎭 Advanced Render Pro (Multi-Pass Compositor)
Take absolute control over your outputs. Hook up the **Advanced Render Pro** node to mix and match background treatments across passes in a single run. Need your Normal map on a pure black background but your Color pass perfectly transparent? This node handles it effortlessly.

![Advanced Render Node](https://github.com/user-attachments/assets/5de88f62-fafb-48e8-b8a2-5b315c2a7551)

### 🔄 Turntable 3D Pro
Render full 360° spinning image batches automatically synced to your viewer's resolution. Perfect for **AnimateDiff**, **ControlNet Multi-view**, or creating stunning product showcases directly inside your workflow.

![Turntable Node](https://github.com/user-attachments/assets/9cfbc8ec-002f-4b28-a702-b5d3fa9c26b2)

---

## 🛠️ Technical Excellence
- **Pure Output Renders** - Automatically forces "Flat Base" lighting during render to guarantee clean, shadow-free feature maps for AI conditioning.
- **RGBA Transparency** - Full support for transparent background renders with native Alpha channels.
- **OS Scaling Fix** - Built-in bypass for Windows DPI scaling ensures your 1024x1024 render is *exactly* 1024x1024 pixels.
- **Studio Sync** - Uploading a background to the main viewer automatically broadcasts the exact resolution to all Turntable nodes to maintain flawless aspect ratios.

## 📦 Installation

### Method 1: Git Clone (Recommended)
1. Navigate to your `ComfyUI/custom_nodes/` folder in a terminal.
2. Run the following command:
```bash
git clone https://github.com/brandondunwell/comfyui-3d-viewer-pro
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

-*NOTE* - YOU NEED TO RUN THE NODE ONCE AFTER YOU LOAD A 3D MODEL USING THE "UPLOAD 3D MODEL" BUTTON - AFTER THAT YOU CAN JUST SELECT THE MODELS FROM THE DROP DOWN LIST.

## 📜 Credits & License
- Built with [Three.js](https://threejs.org/)
- UI inspired by modern creative suites.
- Licensed under the **MIT License**.
