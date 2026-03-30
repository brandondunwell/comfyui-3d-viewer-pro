import os
import time
import numpy as np
import torch
from PIL import Image, ImageOps
from server import PromptServer
import folder_paths

from ..shared import RENDER_SYNC

class AdvancedRenderPro:
    """
    Take an existing MODEL3D from the loader and render multiple passes
    with individualized background settings (Transparent, Black, Original).
    """

    @classmethod
    def INPUT_TYPES(cls):
        bg_options = ["Original", "Black", "Transparent"]
        return {
            "required": {
                "model3d": ("MODEL3D",),
                "resolution": ("INT", {"default": 1024, "min": 256, "max": 4096, "step": 64}),
                "color_bg": (bg_options, {"default": "Original"}),
                "depth_bg": (bg_options, {"default": "Black"}),
                "normal_bg": (bg_options, {"default": "Black"}),
                "wireframe_bg": (bg_options, {"default": "Black"}),
                "ao_bg": (bg_options, {"default": "Black"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("IMAGE", "IMAGE", "IMAGE", "IMAGE", "IMAGE", "MASK")
    RETURN_NAMES = ("color", "depth", "normal", "wireframe", "ao_silhouette", "mask")
    OUTPUT_NODE = True
    FUNCTION = "render_advanced"
    CATEGORY = "3D Viewer Pro"
    DESCRIPTION = "Granular control over specific render pass backgrounds."

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("NaN")

    def render_advanced(self, model3d, resolution=1024, 
                         color_bg="Original", depth_bg="Black", normal_bg="Black", 
                         wireframe_bg="Black", ao_bg="Black", unique_id=None):

        out_temp_dir = folder_paths.get_temp_directory()
        os.makedirs(out_temp_dir, exist_ok=True)

        render_config = {
            "model": model3d,
            "render": {
                "width": resolution,
                "height": resolution,
                "output_dir": out_temp_dir,
                "unique_id": unique_id,
                "is_advanced": True, # Flag for JS to use pass_configs
                "pass_configs": {
                    "color": {"bg": color_bg},
                    "depth": {"bg": depth_bg},
                    "normal": {"bg": normal_bg},
                    "wireframe": {"bg": wireframe_bg},
                    "ao_silhouette": {"bg": ao_bg},
                    "mask": {"bg": "White"} # Mask inherently controls its own values, maybe white/black? Wait, mask needs to just be the mask output. Let's send basic default.
                }
            }
        }

        if unique_id is not None:
            RENDER_SYNC[unique_id] = False

        print(f"[3D Viewer Pro] Sending advanced render request...")
        PromptServer.instance.send_sync("viewer3d.render_request", {
            "unique_id": unique_id,
            "config": render_config
        })

        if unique_id is not None:
            timeout = 300
            timed_out = True
            for i in range(timeout):
                if RENDER_SYNC.get(unique_id, False):
                    RENDER_SYNC[unique_id] = False
                    timed_out = False
                    break
                time.sleep(0.1)
            if timed_out:
                print(f"[3D Viewer Pro] WARNING: Timed out waiting for advanced render!")

        pass_names = ["color", "depth", "normal", "wireframe", "ao_silhouette", "mask"]
        results = []

        for pass_name in pass_names:
            img_path = os.path.join(out_temp_dir, f"viewer3d_{unique_id}_{pass_name}.png")
            is_mask = (pass_name == "mask")
            
            # Determine if we expected transparency for this pass so loader converts it to RGBA if possible
            bg_setting = "Black"
            if pass_name in render_config["render"]["pass_configs"]:
                 bg_setting = render_config["render"]["pass_configs"][pass_name]["bg"]
                 
            # Note: For Mask pass, bg is irrelevant it's always white/black.
            bg_transparent = (bg_setting == "Transparent")
            
            image_tensor = self._load_image_as_tensor(img_path, resolution, resolution, is_mask, bg_transparent)
            results.append(image_tensor)

        return tuple(results)

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
                        arr = arr[:, :, 0]
                        return torch.from_numpy(arr)[None,]
                    else:
                        return torch.from_numpy(arr)[None,]
        except Exception as e:
            print(f"[3D Viewer Pro] Error loading advanced pass from {path}: {e}")

        if is_mask:
            blank = np.zeros((height, width), dtype=np.float32)
        elif bg_transparent:
            blank = np.zeros((height, width, 4), dtype=np.float32)
        else:
            blank = np.zeros((height, width, 3), dtype=np.float32)
        return torch.from_numpy(blank)[None,]

NODE_CLASS_MAPPINGS = {
    "AdvancedRenderPro": AdvancedRenderPro,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "AdvancedRenderPro": "Advanced Render Pro",
}
