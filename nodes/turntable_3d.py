import os
import time
import numpy as np
import torch
from PIL import Image, ImageOps
from server import PromptServer
import folder_paths

from ..shared import RENDER_SYNC


class Turntable3DPro:
    """
    Render a 360° turntable animation of a 3D model, producing a batch of
    images at evenly-spaced angles. Ideal for ControlNet multi-view,
    AnimateDiff, or creating product spin animations.

    Requires a model3d input from Load & Preview 3D Model Pro.
    The model must be loaded in the viewport before running this node.
    """

    @classmethod
    def INPUT_TYPES(cls):
        return {
            "required": {
                "model3d": ("MODEL3D", {"tooltip": "3D model from Load & Preview 3D Model Pro"}),
                "num_frames": ("INT", {"default": 16, "min": 4, "max": 120, "step": 1,
                                       "tooltip": "Number of frames in the turntable rotation"}),
            },
            "optional": {
                "width": ("INT", {"default": 1024, "min": 256, "max": 4096, "step": 64}),
                "height": ("INT", {"default": 1024, "min": 256, "max": 4096, "step": 64}),
                "pitch": ("FLOAT", {"default": 20.0, "min": -90.0, "max": 90.0, "step": 1.0,
                                    "tooltip": "Camera elevation angle in degrees"}),
                "start_from_front_view": ("BOOLEAN", {"default": False, "tooltip": "Start from 0° (true) or current view (false)"}),
                "render_mode": (["color", "normal", "depth", "wireframe", "matcap"],
                               {"default": "color", "tooltip": "Material pass to render"}),
                "bg_mode": (["Original", "Black", "White", "Transparent"],
                           {"default": "Original", "tooltip": "Background style"}),
            },
            "hidden": {
                "unique_id": "UNIQUE_ID",
            }
        }

    RETURN_TYPES = ("IMAGE",)
    RETURN_NAMES = ("image_batch",)
    FUNCTION = "render_turntable"
    CATEGORY = "3D Viewer Pro"
    DESCRIPTION = "Render a 360° turntable of a 3D model as an image batch."

    @classmethod
    def IS_CHANGED(cls, **kwargs):
        return float("NaN")

    def render_turntable(self, model3d, num_frames=16, width=1024, height=1024,
                         pitch=20.0, start_from_front_view=False,
                         render_mode="color", bg_mode="Original", unique_id=None):
        temp_dir = folder_paths.get_temp_directory()
        os.makedirs(temp_dir, exist_ok=True)

        # Build list of camera angle offsets
        angle_offsets = []
        for i in range(num_frames):
            angle_offsets.append(360.0 * i / num_frames)

        turntable_config = {
            "model": {
                "path": model3d["path"],
                "format": model3d["format"],
                "settings": model3d["settings"],
            },
            "turntable": {
                "width": width,
                "height": height,
                "num_frames": num_frames,
                "angle_offsets": angle_offsets,
                "pitch": pitch,
                "render_mode": render_mode,
                "bg_mode": bg_mode,
                "start_from_front_view": start_from_front_view,
                "output_dir": temp_dir,
                "unique_id": unique_id,
            }
        }

        # Register sync
        if unique_id is not None:
            RENDER_SYNC[unique_id] = False
            print(f"[3D Viewer Pro] Turntable: Registered sync for unique_id={unique_id}")

        # Signal frontend
        PromptServer.instance.send_sync("viewer3d.turntable_request", {
            "unique_id": unique_id,
            "config": turntable_config,
        })
        print(f"[3D Viewer Pro] Turntable: Sent request to frontend ({num_frames} frames, {width}x{height})")

        # Wait for completion (longer timeout for many frames)
        if unique_id is not None:
            timeout = max(600, num_frames * 20)  # Scale timeout with frame count
            timed_out = True
            for i in range(timeout):
                if RENDER_SYNC.get(unique_id, False):
                    RENDER_SYNC[unique_id] = False
                    timed_out = False
                    print(f"[3D Viewer Pro] Turntable: Frontend completed after {i*0.1:.1f}s")
                    break
                time.sleep(0.1)
            if timed_out:
                print(f"[3D Viewer Pro] WARNING: Turntable timed out after {timeout*0.1:.0f}s!")

        # Load all frames and stack into a batch
        frames = []
        is_transparent = (bg_mode == "Transparent")
        for i in range(num_frames):
            img_path = os.path.join(temp_dir, f"viewer3d_{unique_id}_turntable_{i:04d}.png")
            tensor = self._load_image_as_tensor(img_path, width, height, is_transparent)
            frames.append(tensor)

        # Stack into batch [B, H, W, C]
        batch = torch.cat(frames, dim=0)
        print(f"[3D Viewer Pro] Turntable: Final batch shape: {batch.shape}")
        return (batch,)

    def _load_image_as_tensor(self, path, width, height, bg_transparent=False):
        """Load an image file as a torch tensor, or return blank."""
        try:
            if os.path.exists(path) and os.path.getsize(path) > 0:
                with Image.open(path) as img:
                    img = ImageOps.exif_transpose(img)
                    if bg_transparent:
                        img = img.convert("RGBA")
                    else:
                        img = img.convert("RGB")
                    arr = np.array(img).astype(np.float32) / 255.0
                    print(f"[3D Viewer Pro]   -> Turntable frame loaded: {arr.shape}")
                    return torch.from_numpy(arr)[None,]
        except Exception as e:
            print(f"[3D Viewer Pro] Error loading {path}: {e}")

        if bg_transparent:
            blank = np.zeros((height, width, 4), dtype=np.float32)
        else:
            blank = np.zeros((height, width, 3), dtype=np.float32)
        return torch.from_numpy(blank)[None,]


NODE_CLASS_MAPPINGS = {
    "Turntable3DPro": Turntable3DPro,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "Turntable3DPro": "Turntable 3D Pro",
}
