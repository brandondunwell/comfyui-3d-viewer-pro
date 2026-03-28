import os
import time
import numpy as np
import torch
from PIL import Image, ImageOps
from server import PromptServer
import folder_paths

from ..shared import RENDER_SYNC

# ── Ensure the 3d input directory exists ─────────────────────────────────────
MODELS_3D_DIR = os.path.join(folder_paths.get_input_directory(), "3d")
os.makedirs(MODELS_3D_DIR, exist_ok=True)

SUPPORTED_EXTENSIONS = (".glb", ".gltf", ".obj", ".stl", ".fbx")

def get_model_list():
    """Scan the 3d input directory for supported model files."""
    models = []
    if not os.path.exists(MODELS_3D_DIR):
        return models
    for root, _dirs, files in os.walk(MODELS_3D_DIR):
        for fname in files:
            ext = os.path.splitext(fname)[1].lower()
            if ext in SUPPORTED_EXTENSIONS:
                rel = os.path.relpath(os.path.join(root, fname), MODELS_3D_DIR)
                models.append(rel.replace("\\", "/"))
    return sorted(models) if models else ["none"]

class LoadAndPreview3DModelPro:
    """
    Load a 3D model file, preview it in an interactive Three.js viewer,
    and output rendered passes based on the interactive camera view.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model_file": (get_model_list(), {"tooltip": "Select a 3D model from ComfyUI/input/3d/."}),
                "up_direction": (["Y", "Z", "-Y", "-Z"], {"default": "Y", "tooltip": "Up axis of the model"}),
            },
            "optional": {
                "custom_path": ("STRING", {"default": "", "tooltip": "Absolute file path to a 3D model anywhere."}),
                "scale": ("FLOAT", {"default": 1.0, "min": 0.001, "max": 100.0, "step": 0.01}),
                "center_model": ("BOOLEAN", {"default": True}),
                "auto_scale": ("BOOLEAN", {"default": True}),
                
                # Render Settings
                "width": ("INT", {"default": 1024, "min": 256, "max": 4096, "step": 64}),
                "height": ("INT", {"default": 1024, "min": 256, "max": 4096, "step": 64}),
                "bg_transparent": ("BOOLEAN", {"default": False}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("MODEL3D", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "MASK")
    RETURN_NAMES = ("model3d", "color", "depth", "normal", "wireframe", "ao_silhouette", "mask")
    OUTPUT_NODE = True  # Allows UI updates
    FUNCTION = "load_and_preview"
    CATEGORY = "3D Viewer Pro"
    DESCRIPTION = "Load, preview, and render 3D model to multiple image passes."

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        # Always force execution to get fresh renders based on current interactive viewport state
        return float("NaN")

    @classmethod
    def VALIDATE_INPUTS(cls, model_file, custom_path="", **kwargs):
        filepath = cls._resolve_path(model_file, custom_path)
        if filepath is None:
            return "No 3D model specified."
        if not os.path.exists(filepath):
            return f"Model file not found: {filepath}"
        ext = os.path.splitext(filepath)[1].lower()
        if ext not in SUPPORTED_EXTENSIONS:
            return f"Unsupported format: {ext}."
        return True

    @staticmethod
    def _resolve_path(model_file, custom_path=""):
        if custom_path and custom_path.strip():
            path = os.path.normpath(custom_path.strip())
            if os.path.isabs(path):
                return path
            return os.path.join(MODELS_3D_DIR, path)
        if model_file and model_file != "none":
            return os.path.join(MODELS_3D_DIR, model_file)
        return None

    def load_and_preview(self, model_file, up_direction="Y", custom_path="",
                         scale=1.0, center_model=True, auto_scale=True,
                         width=1024, height=1024, bg_transparent=False, unique_id=None):
                         
        filepath = self._resolve_path(model_file, custom_path)
        ext = os.path.splitext(filepath)[1].lower().lstrip(".")
        file_size = os.path.getsize(filepath)

        real_filepath = os.path.realpath(filepath)
        real_models_dir = os.path.realpath(MODELS_3D_DIR)

        if real_filepath.startswith(real_models_dir):
            rel_path = os.path.relpath(real_filepath, real_models_dir).replace("\\", "/")
            serve_path = rel_path
            serve_mode = "api"
        else:
            import shutil
            temp_dir = os.path.join(folder_paths.get_temp_directory(), "viewer3d_models")
            os.makedirs(temp_dir, exist_ok=True)
            temp_name = os.path.basename(filepath)
            temp_path = os.path.join(temp_dir, temp_name)
            if (not os.path.exists(temp_path) or os.path.getmtime(filepath) > os.path.getmtime(temp_path)):
                shutil.copy2(filepath, temp_path)
            serve_path = temp_name
            serve_mode = "temp"

        model3d = {
            "path": serve_path,
            "absolute_path": filepath,
            "format": ext,
            "file_size": file_size,
            "serve_mode": serve_mode,
            "settings": {
                "up_direction": up_direction,
                "scale": scale,
                "center_model": center_model,
                "auto_scale": auto_scale,
            }
        }

        viewer_data = {
            "model": model3d,
            "viewer": {
                 "width": width,
                 "height": height,
                 "bg_transparent": bg_transparent
            }
        }

        # --- Render synchronization phase ---
        out_temp_dir = folder_paths.get_temp_directory()
        os.makedirs(out_temp_dir, exist_ok=True)

        render_config = {
            "model": model3d,
            "render": {
                "width": width,
                "height": height,
                "bg_transparent": bg_transparent,
                "output_dir": out_temp_dir,
                "unique_id": unique_id,
            }
        }

        if unique_id is not None:
            RENDER_SYNC[unique_id] = False
            print(f"[3D Viewer Pro] Render sync initialized for unique_id={unique_id} (type={type(unique_id).__name__})")

        # Request renders from the frontend.
        print(f"[3D Viewer Pro] Sending render request to frontend...")
        PromptServer.instance.send_sync("viewer3d.render_request", {
            "unique_id": unique_id,
            "config": render_config
        })
        print(f"[3D Viewer Pro] Render request sent. Waiting for frontend...")

        # Wait for frontend to complete rendering
        if unique_id is not None:
            timeout = 300  # 30 seconds max wait
            timed_out = True
            for i in range(timeout):
                if RENDER_SYNC.get(unique_id, False):
                    RENDER_SYNC[unique_id] = False
                    timed_out = False
                    print(f"[3D Viewer Pro] Frontend signaled completion after {i*0.1:.1f}s")
                    break
                time.sleep(0.1)
            if timed_out:
                print(f"[3D Viewer Pro] WARNING: Timed out waiting for frontend render after 30s!")
                print(f"[3D Viewer Pro] RENDER_SYNC state: {RENDER_SYNC}")

        # Load the rendered pass images
        pass_names = ["color", "depth", "normal", "wireframe", "ao_silhouette", "mask"]
        results = [model3d]

        for pass_name in pass_names:
            img_path = os.path.join(out_temp_dir, f"viewer3d_{unique_id}_{pass_name}.png")
            exists = os.path.exists(img_path)
            size = os.path.getsize(img_path) if exists else 0
            print(f"[3D Viewer Pro] Loading pass '{pass_name}': exists={exists}, size={size}B, path={img_path}")
            is_mask = (pass_name == "mask")
            image_tensor = self._load_image_as_tensor(img_path, width, height, is_mask, bg_transparent)
            results.append(image_tensor)

        return {"ui": {"viewer_data": [viewer_data]}, "result": tuple(results)}

    def _load_image_as_tensor(self, path, width, height, is_mask=False, bg_transparent=False):
        try:
            if os.path.exists(path) and os.path.getsize(path) > 0:
                with Image.open(path) as img:
                    img = ImageOps.exif_transpose(img)
                    
                    if not is_mask and bg_transparent:
                        img = img.convert("RGBA")
                    else:
                        img = img.convert("RGB")
                        
                    arr = np.array(img).astype(np.float32) / 255.0
                    
                    if is_mask:
                        # Extract single channel for MASK [1, H, W]
                        arr = arr[:, :, 0]
                        print(f"[3D Viewer Pro]   -> Loaded MASK tensor shape: {arr.shape}")
                        return torch.from_numpy(arr)[None,]
                    else:
                        print(f"[3D Viewer Pro]   -> Loaded IMAGE tensor shape: {arr.shape}")
                        return torch.from_numpy(arr)[None,]
        except Exception as e:
            print(f"[3D Viewer Pro] Error loading pass from {path}: {e}")

        # Blank image fallback
        print(f"[3D Viewer Pro]   -> FALLBACK: returning blank {width}x{height} tensor")
        if is_mask:
            blank = np.zeros((height, width), dtype=np.float32)
        elif bg_transparent:
            blank = np.zeros((height, width, 4), dtype=np.float32)
        else:
            blank = np.zeros((height, width, 3), dtype=np.float32)
        return torch.from_numpy(blank)[None,]

NODE_CLASS_MAPPINGS = {
    "LoadAndPreview3DModelPro": LoadAndPreview3DModelPro,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoadAndPreview3DModelPro": "Load & Preview 3D Model Pro",
}
