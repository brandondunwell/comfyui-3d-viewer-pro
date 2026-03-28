"""
Shared state between Python nodes and server routes.
This module provides thread-safe synchronization primitives
for the render pipeline (frontend JS ↔ backend Python).
"""

# Global render sync dictionary.
# Keys are unique_id strings, values are booleans.
# Set to True by the frontend (via /viewer3d/render_complete) when a render finishes.
# Polled by Render3DPassesPro and Turntable3DPro nodes to know when images are ready.
RENDER_SYNC = {}
