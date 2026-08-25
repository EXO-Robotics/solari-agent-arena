"""Author the contract-compliant AION H1-S visual GLB.

First-milestone geometry: rigid-link original AION made of authored
primitives. Not a production sculpt. Names, origins, materials, and
export flags must match docs/VISUAL_MODEL_CONTRACT.md.
"""

from __future__ import annotations

import json
import math
import struct
from pathlib import Path

import bmesh
import bpy
from mathutils import Euler, Vector

if "AION_PROJECT_ROOT" in globals():
    PROJECT_ROOT = Path(AION_PROJECT_ROOT).resolve()
elif "__file__" in globals():
    PROJECT_ROOT = Path(__file__).resolve().parents[2]
else:
    raise RuntimeError("AION_PROJECT_ROOT is required when executing without a script file.")
GLB_PATH = PROJECT_ROOT / "public" / "models" / "aion-h1s.glb"
BLEND_PATH = PROJECT_ROOT / "assets" / "blender" / "aion-h1s.blend"
MANIFEST_PATH = PROJECT_ROOT / "src" / "assets" / "aion-h1s.manifest.json"

LINKS = [
    ("pelvis", (0.0, 0.0, 0.89)),
    ("torso", (0.0, 0.0, 1.03)),
    ("head", (0.0, 0.0, 1.54)),
    ("left_upper_arm", (0.0, 0.255, 1.39)),
    ("left_forearm", (0.0, 0.255, 1.10)),
    ("right_upper_arm", (0.0, -0.255, 1.39)),
    ("right_forearm", (0.0, -0.255, 1.10)),
    ("left_thigh", (0.0, 0.1, 0.80)),
    ("left_shin", (0.0, 0.1, 0.43)),
    ("left_foot", (0.0, 0.1, 0.07)),
    ("right_thigh", (0.0, -0.1, 0.80)),
    ("right_shin", (0.0, -0.1, 0.43)),
    ("right_foot", (0.0, -0.1, 0.07)),
]

LINK_NAMES = [name for name, _ in LINKS]


def assert_safe_scene() -> None:
    """Refuse to replace unrelated or unsaved work in the active Blender process."""
    if bpy.data.is_dirty:
        raise RuntimeError("Refusing to rebuild over unsaved Blender changes. Save or revert them first.")
    if bpy.data.filepath:
        active_path = Path(bpy.data.filepath).resolve()
        if active_path != BLEND_PATH.resolve():
            raise RuntimeError(
                f"Refusing to rebuild over an unrelated Blender file: {active_path}. "
                f"Open {BLEND_PATH} or a clean default startup scene."
            )
        return
    startup_names = {obj.name for obj in bpy.context.scene.objects}
    if not startup_names.issubset({"Cube", "Camera", "Light"}):
        raise RuntimeError("Refusing to rebuild over a non-default unsaved Blender scene.")


def clear_scene() -> None:
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)
    for block in (bpy.data.meshes, bpy.data.materials, bpy.data.cameras, bpy.data.lights):
        for item in list(block):
            block.remove(item)


def set_socket(principled, names: tuple[str, ...], value) -> None:
    for name in names:
        socket = principled.inputs.get(name)
        if socket is not None:
            socket.default_value = value
            return


def make_material(name: str, color, metallic: float, roughness: float, emission=None, emission_strength: float = 0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    principled = mat.node_tree.nodes.get("Principled BSDF")
    set_socket(principled, ("Base Color",), (*color, 1.0))
    set_socket(principled, ("Metallic",), metallic)
    set_socket(principled, ("Roughness",), roughness)
    if emission is not None:
        set_socket(principled, ("Emission Color", "Emission"), (*emission, 1.0))
        set_socket(principled, ("Emission Strength",), emission_strength)
    return mat


def make_materials() -> dict[str, bpy.types.Material]:
    return {
        "AION_Cover": make_material("AION_Cover", (0.902, 0.875, 0.816), 0.04, 0.52),
        "AION_Anodized": make_material("AION_Anodized", (0.028, 0.032, 0.030), 0.82, 0.32),
        "AION_Aluminum": make_material("AION_Aluminum", (0.56, 0.58, 0.54), 0.90, 0.26),
        "AION_Rubber": make_material("AION_Rubber", (0.012, 0.012, 0.012), 0.0, 0.92),
        "AION_Visor": make_material("AION_Visor", (0.008, 0.014, 0.010), 0.12, 0.06),
        "AION_LED": make_material("AION_LED", (0.02, 0.05, 0.04), 0.1, 0.35, emission=(0.36, 1.0, 0.88), emission_strength=12.0),
    }


def new_mesh(name: str) -> bpy.types.Object:
    mesh = bpy.data.meshes.new(name)
    obj = bpy.data.objects.new(name, mesh)
    bpy.context.scene.collection.objects.link(obj)
    return obj


def finish_mesh(obj: bpy.types.Object, parent: bpy.types.Object, local: Vector, material, rotation=None) -> bpy.types.Object:
    obj.parent = parent
    obj.matrix_parent_inverse.identity()
    obj.location = local
    if rotation is not None:
        obj.rotation_euler = rotation
    obj.data.materials.append(material)
    obj.data.update()
    return obj


def add_box(name: str, parent, hx: float, hy: float, hz: float, local, material, rotation=None):
    obj = new_mesh(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, verts=bm.verts, vec=(hx * 2.0, hy * 2.0, hz * 2.0))
    bm.to_mesh(obj.data)
    bm.free()
    return finish_mesh(obj, parent, Vector(local), material, rotation)


def add_cylinder(name: str, parent, radius: float, height: float, local, material, rotation=None, segments: int = 20):
    obj = new_mesh(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(
        bm,
        cap_ends=True,
        cap_tris=False,
        segments=segments,
        radius1=radius,
        radius2=radius,
        depth=height,
    )
    bm.to_mesh(obj.data)
    bm.free()
    return finish_mesh(obj, parent, Vector(local), material, rotation)


def add_uv_sphere(name: str, parent, radius: float, local, material):
    obj = new_mesh(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=16, v_segments=10, radius=radius)
    bm.to_mesh(obj.data)
    bm.free()
    return finish_mesh(obj, parent, Vector(local), material)


def make_link(name: str, world) -> bpy.types.Object:
    empty = bpy.data.objects.new(name, None)
    empty.empty_display_type = "ARROWS"
    empty.empty_display_size = 0.08
    empty.location = world
    bpy.context.scene.collection.objects.link(empty)
    return empty


def build_robot(materials) -> dict[str, bpy.types.Object]:
    links = {name: make_link(name, world) for name, world in LINKS}
    y90 = Euler((math.pi / 2.0, 0.0, 0.0), "XYZ")

    pelvis = links["pelvis"]
    add_box("pelvis_chassis", pelvis, 0.13, 0.155, 0.055, (0.0, 0.0, 0.0), materials["AION_Anodized"])
    add_cylinder("pelvis_hip_can_l", pelvis, 0.052, 0.078, (0.0, 0.148, -0.01), materials["AION_Aluminum"], y90)
    add_cylinder("pelvis_hip_can_r", pelvis, 0.052, 0.078, (0.0, -0.148, -0.01), materials["AION_Aluminum"], y90)
    add_box("pelvis_cover", pelvis, 0.05, 0.12, 0.022, (0.095, 0.0, 0.028), materials["AION_Cover"])

    torso = links["torso"]
    add_box("torso_lower", torso, 0.12, 0.155, 0.09, (0.0, 0.0, 0.08), materials["AION_Cover"])
    add_box("torso_upper", torso, 0.135, 0.19, 0.14, (0.0, 0.0, 0.26), materials["AION_Cover"])
    add_box("torso_panel", torso, 0.018, 0.11, 0.1, (0.12, 0.0, 0.22), materials["AION_Anodized"])
    add_box("torso_led", torso, 0.008, 0.055, 0.006, (0.142, 0.0, 0.34), materials["AION_LED"])
    add_box("torso_plate", torso, 0.004, 0.035, 0.012, (0.139, 0.0, 0.16), materials["AION_Aluminum"])
    add_cylinder("torso_shoulder_l", torso, 0.048, 0.04, (0.0, 0.22, 0.34), materials["AION_Aluminum"], y90)
    add_cylinder("torso_shoulder_r", torso, 0.048, 0.04, (0.0, -0.22, 0.34), materials["AION_Aluminum"], y90)

    head = links["head"]
    add_cylinder("head_neck", head, 0.042, 0.07, (0.0, 0.0, 0.02), materials["AION_Anodized"])
    add_box("head_shell", head, 0.095, 0.09, 0.075, (0.0, 0.0, 0.12), materials["AION_Cover"])
    add_box("head_visor", head, 0.1, 0.082, 0.028, (0.018, 0.0, 0.128), materials["AION_Visor"])
    add_box("head_led", head, 0.006, 0.04, 0.006, (0.118, 0.0, 0.128), materials["AION_LED"])
    add_cylinder("head_puck", head, 0.032, 0.03, (0.0, 0.0, 0.205), materials["AION_Anodized"])

    for side, upper, forearm in (
        (1.0, "left_upper_arm", "left_forearm"),
        (-1.0, "right_upper_arm", "right_forearm"),
    ):
        arm = links[upper]
        add_cylinder(f"{upper}_can", arm, 0.046, 0.07, (0.0, 0.018 * side, 0.0), materials["AION_Aluminum"], y90)
        add_cylinder(f"{upper}_cover", arm, 0.04, 0.24, (0.0, 0.0, -0.13), materials["AION_Cover"])
        hand = links[forearm]
        add_cylinder(f"{forearm}_tube", hand, 0.034, 0.2, (0.0, 0.0, -0.11), materials["AION_Anodized"])
        add_cylinder(f"{forearm}_cuff", hand, 0.038, 0.03, (0.0, 0.0, -0.22), materials["AION_Aluminum"])
        add_box(f"{forearm}_grip", hand, 0.04, 0.028, 0.07, (0.012, 0.0, -0.28), materials["AION_Rubber"])

    for side, thigh, shin, foot in (
        (1.0, "left_thigh", "left_shin", "left_foot"),
        (-1.0, "right_thigh", "right_shin", "right_foot"),
    ):
        t = links[thigh]
        add_cylinder(f"{thigh}_can", t, 0.058, 0.08, (0.0, 0.0, 0.0), materials["AION_Aluminum"], y90)
        add_cylinder(f"{thigh}_cover", t, 0.06, 0.28, (0.0, 0.0, -0.175), materials["AION_Cover"])
        s = links[shin]
        add_uv_sphere(f"{shin}_knee_can", s, 0.058, (0.0, 0.0, 0.0), materials["AION_Aluminum"])
        add_cylinder(f"{shin}_tube", s, 0.046, 0.28, (0.0, 0.0, -0.175), materials["AION_Anodized"])
        f = links[foot]
        add_box(f"{foot}_chassis", f, 0.12, 0.055, 0.02, (0.06, 0.0, -0.028), materials["AION_Aluminum"])
        add_box(f"{foot}_sole", f, 0.135, 0.062, 0.012, (0.065, 0.0, -0.052), materials["AION_Rubber"])
        add_box(f"{foot}_toe", f, 0.035, 0.05, 0.01, (0.165, 0.0, -0.048), materials["AION_Rubber"])

    return links


def triangle_count() -> int:
    total = 0
    for obj in bpy.data.objects:
        if obj.type != "MESH" or obj.data is None:
            continue
        obj.data.calc_loop_triangles()
        total += len(obj.data.loop_triangles)
    return total


def glb_node_names(path: Path) -> list[str]:
    data = path.read_bytes()
    if data[:4] != b"glTF":
        raise RuntimeError("Export is not a GLB")
    json_length = struct.unpack_from("<I", data, 12)[0]
    chunk = data[20:20 + json_length].decode("utf-8").rstrip("\x00")
    gltf = json.loads(chunk)
    return [node.get("name", "") for node in gltf.get("nodes", [])]


def export_glb() -> None:
    GLB_PATH.parent.mkdir(parents=True, exist_ok=True)
    BLEND_PATH.parent.mkdir(parents=True, exist_ok=True)
    MANIFEST_PATH.parent.mkdir(parents=True, exist_ok=True)
    bpy.ops.wm.save_as_mainfile(filepath=str(BLEND_PATH))
    kwargs = dict(
        filepath=str(GLB_PATH),
        export_format="GLB",
        use_selection=False,
        export_apply=True,
        export_cameras=False,
        export_extras=False,
        export_yup=False,
    )
    try:
        bpy.ops.export_scene.gltf(**kwargs, export_animations=False, export_lights=False)
    except TypeError:
        bpy.ops.export_scene.gltf(**kwargs)


def build() -> dict:
    assert_safe_scene()
    clear_scene()
    materials = make_materials()
    links = build_robot(materials)
    missing = [name for name in LINK_NAMES if name not in links]
    if missing:
        raise RuntimeError(f"Missing links: {missing}")
    export_glb()
    names = glb_node_names(GLB_PATH)
    present = [name for name in LINK_NAMES if name in names]
    missing_nodes = [name for name in LINK_NAMES if name not in names]
    tris = triangle_count()
    bytes_len = GLB_PATH.stat().st_size
    manifest = {
        "nodes": LINK_NAMES,
        "exportedNodeNames": names,
        "materials": list(materials.keys()),
        "triangles": tris,
        "bytes": bytes_len,
        "exportYup": False,
        "blend": str(BLEND_PATH.relative_to(PROJECT_ROOT)),
        "glb": str(GLB_PATH.relative_to(PROJECT_ROOT)),
    }
    MANIFEST_PATH.write_text(json.dumps(manifest, indent=2) + "\n")
    return {
        "ok": missing_nodes == [],
        "nodes": present,
        "missing": missing_nodes,
        "triangles": tris,
        "bytes": bytes_len,
        "glb": str(GLB_PATH),
        "manifest": str(MANIFEST_PATH),
    }


result = build()
