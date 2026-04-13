import os
import json
import hashlib
import folder_paths
from aiohttp import web
from server import PromptServer

# ── Directory setup ──────────────────────────────────────────────────────────
EXTENSION_DIR = os.path.dirname(os.path.dirname(os.path.realpath(__file__)))
MODELS_3D_DIR = os.path.join(folder_paths.get_input_directory(), "3d")
HDRI_DIR = os.path.join(folder_paths.get_input_directory(), "hdri")

# Supported 3D model formats
SUPPORTED_FORMATS = (".glb", ".gltf", ".obj", ".stl", ".fbx", ".ply")

# Global render sync state — shared with nodes
from ..shared import RENDER_SYNC


def ensure_dirs():
    """Ensure required directories exist."""
    for d in [MODELS_3D_DIR, HDRI_DIR]:
        os.makedirs(d, exist_ok=True)

ensure_dirs()


def scan_models(directory, supported=SUPPORTED_FORMATS):
    """Recursively scan a directory for 3D model files."""
    models = []
    if not os.path.exists(directory):
        return models
    for root, _dirs, files in os.walk(directory):
        for fname in files:
            ext = os.path.splitext(fname)[1].lower()
            if ext in supported:
                full_path = os.path.join(root, fname)
                rel_path = os.path.relpath(full_path, directory)
                size = os.path.getsize(full_path)
                models.append({
                    "name": fname,
                    "path": rel_path.replace("\\", "/"),
                    "size": size,
                    "format": ext.lstrip(".")
                })
    return models


# ── API Routes ───────────────────────────────────────────────────────────────

@PromptServer.instance.routes.get("/viewer3d/models")
async def get_models(request):
    """List all available 3D model files."""
    try:
        models = scan_models(MODELS_3D_DIR)
        return web.json_response({"status": "ok", "models": models})
    except Exception as e:
        print(f"[3D Viewer Pro] Error listing models: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)


@PromptServer.instance.routes.get("/viewer3d/model/{filename:.+}")
async def serve_model(request):
    """Serve a 3D model file to the frontend viewer."""
    filename = request.match_info["filename"]
    file_path = os.path.join(MODELS_3D_DIR, filename)

    # Security: ensure the path doesn't escape the models directory
    real_path = os.path.realpath(file_path)
    real_models = os.path.realpath(MODELS_3D_DIR)
    if not real_path.startswith(real_models):
        return web.json_response({"status": "error", "message": "Invalid path"}, status=403)

    if not os.path.exists(real_path):
        return web.json_response({"status": "error", "message": "File not found"}, status=404)

    # Determine content type
    ext = os.path.splitext(filename)[1].lower()
    content_types = {
        ".glb": "model/gltf-binary",
        ".gltf": "model/gltf+json",
        ".obj": "text/plain",
        ".mtl": "text/plain",
        ".stl": "application/octet-stream",
        ".fbx": "application/octet-stream",
        ".ply": "application/octet-stream",
    }
    content_type = content_types.get(ext, "application/octet-stream")

    response = web.FileResponse(real_path)
    response.content_type = content_type
    response.headers["Cache-Control"] = "no-cache"
    response.headers["Access-Control-Allow-Origin"] = "*"
    return response


@PromptServer.instance.routes.get("/viewer3d/hdri")
async def get_hdri_list(request):
    """List available HDRI environment maps."""
    try:
        hdris = []
        if os.path.exists(HDRI_DIR):
            for fname in os.listdir(HDRI_DIR):
                if fname.lower().endswith((".hdr", ".exr", ".png", ".jpg")):
                    hdris.append({
                        "name": fname,
                        "path": fname,
                        "size": os.path.getsize(os.path.join(HDRI_DIR, fname))
                    })
        return web.json_response({"status": "ok", "hdris": hdris})
    except Exception as e:
        return web.json_response({"status": "error", "message": str(e)}, status=500)


@PromptServer.instance.routes.post("/viewer3d/upload_render")
async def upload_render(request):
    """Save a base64 rendered pass image from the frontend."""
    import base64
    import folder_paths
    
    try:
        data = await request.json()
        unique_id = data.get("unique_id")
        pass_name = data.get("pass_name")
        image_data = data.get("image")
        
        if not all([unique_id, pass_name, image_data]):
            return web.json_response({"status": "error", "message": "Missing parameters"}, status=400)
            
        # Parse base64
        if "base64," in image_data:
            image_data = image_data.split("base64,")[1]
            
        img_bytes = base64.b64decode(image_data)
        
        # Save to temp directory matching the node's expectation
        temp_dir = folder_paths.get_temp_directory()
        filepath = os.path.join(temp_dir, f"viewer3d_{unique_id}_{pass_name}.png")
        
        with open(filepath, "wb") as f:
            f.write(img_bytes)
            
        return web.json_response({"status": "ok", "saved": filepath})
    except Exception as e:
        print(f"[3D Viewer Pro] Upload render error: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)

@PromptServer.instance.routes.post("/viewer3d/render_complete")
async def render_complete(request):
    """Signal from frontend that a render pass has completed."""
    try:
        data = await request.json()
        unique_id = data.get("unique_id")
        print(f"[3D Viewer Pro] render_complete called with unique_id={unique_id} (type={type(unique_id).__name__})")
        print(f"[3D Viewer Pro] RENDER_SYNC keys: {list(RENDER_SYNC.keys())}")
        
        if unique_id is not None:
            # Try both string and original type for key matching
            str_id = str(unique_id)
            matched = False
            for key in list(RENDER_SYNC.keys()):
                if str(key) == str_id:
                    RENDER_SYNC[key] = True
                    matched = True
                    print(f"[3D Viewer Pro] Render sync signaled for key={key}")
                    break
            
            if matched:
                return web.json_response({"status": "ok"})
            else:
                print(f"[3D Viewer Pro] No matching key found in RENDER_SYNC")
                return web.json_response({"status": "error", "message": f"unique_id '{unique_id}' not found in sync"}, status=400)
        
        return web.json_response({"status": "error", "message": "Missing unique_id"}, status=400)
    except Exception as e:
        print(f"[3D Viewer Pro] render_complete error: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)


@PromptServer.instance.routes.post("/viewer3d/upload")
async def upload_model(request):
    """Upload a 3D model file."""
    try:
        reader = await request.multipart()
        field = await reader.next()

        if field is None:
            return web.json_response({"status": "error", "message": "No file provided"}, status=400)

        filename = field.filename

        # Security: strip any directory components from the filename
        filename = os.path.basename(filename)

        # Reject empty or suspicious filenames
        if not filename or filename.startswith("."):
            return web.json_response({"status": "error", "message": "Invalid filename"}, status=400)

        ext = os.path.splitext(filename)[1].lower()

        if ext not in SUPPORTED_FORMATS:
            return web.json_response({
                "status": "error",
                "message": f"Unsupported format: {ext}. Supported: {', '.join(SUPPORTED_FORMATS)}"
            }, status=400)

        save_path = os.path.join(MODELS_3D_DIR, filename)

        # Security: verify final path is still inside MODELS_3D_DIR
        if not os.path.realpath(save_path).startswith(os.path.realpath(MODELS_3D_DIR)):
            return web.json_response({"status": "error", "message": "Invalid path"}, status=403)

        with open(save_path, "wb") as f:
            while True:
                chunk = await field.read_chunk()
                if not chunk:
                    break
                f.write(chunk)

        return web.json_response({
            "status": "ok",
            "filename": filename,
            "size": os.path.getsize(save_path)
        })
    except Exception as e:
        print(f"[3D Viewer Pro] Upload error: {e}")
        return web.json_response({"status": "error", "message": str(e)}, status=500)


# Serve texture/material files that are referenced by models (e.g. .mtl, .png, .jpg alongside .obj)
@PromptServer.instance.routes.get("/viewer3d/texture/{filename:.+}")
async def serve_texture(request):
    """Serve texture files referenced by 3D models."""
    filename = request.match_info["filename"]
    file_path = os.path.join(MODELS_3D_DIR, filename)

    real_path = os.path.realpath(file_path)
    real_models = os.path.realpath(MODELS_3D_DIR)
    if not real_path.startswith(real_models):
        return web.json_response({"status": "error", "message": "Invalid path"}, status=403)

    if not os.path.exists(real_path):
        return web.json_response({"status": "error", "message": "File not found"}, status=404)

    response = web.FileResponse(real_path)
    response.headers["Cache-Control"] = "max-age=3600"
    return response
