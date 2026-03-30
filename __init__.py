from .nodes.load_3d_model import LoadAndPreview3DModelPro
from .nodes.turntable_3d import Turntable3DPro
from .nodes.advanced_render import AdvancedRenderPro


# Import server routes to register API endpoints
from .server import routes  # noqa: F401

# ── Node Registration ────────────────────────────────────────────────────────
NODE_CLASS_MAPPINGS = {
    "LoadAndPreview3DModelPro": LoadAndPreview3DModelPro,
    "Turntable3DPro": Turntable3DPro,
    "AdvancedRenderPro": AdvancedRenderPro,
}

NODE_DISPLAY_NAME_MAPPINGS = {
    "LoadAndPreview3DModelPro": "Load & Preview 3D Model Pro",
    "Turntable3DPro": "Turntable 3D Pro",
    "AdvancedRenderPro": "Advanced Render Pro",
}

WEB_DIRECTORY = "./js"

# ── Startup Info ─────────────────────────────────────────────────────────────
CYAN = "\033[96m"
GREEN = "\033[92m"
YELLOW = "\033[93m"
MAGENTA = "\033[95m"
CLEAR = "\033[0m"

node_names = ", ".join(NODE_DISPLAY_NAME_MAPPINGS.values())
print(f"\n{MAGENTA}✦ {GREEN}3D Viewer Pro {CYAN}→ {YELLOW}{node_names} {GREEN}<Loaded>{CLEAR}")

__all__ = ["NODE_CLASS_MAPPINGS", "NODE_DISPLAY_NAME_MAPPINGS", "WEB_DIRECTORY"]
