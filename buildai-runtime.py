"""GabCon Browser Studio: reduced, client-side compatible subset of the mcbuild DSL.

Executed inside a disposable Pyodide Web Worker. No access to the server engine.
This is a preview-compatible interpreter, not the full mcbuild renderer/registry.
"""
import ast
import json
import math
import random
import re
import sys
import time

MAX_SPAN = 512
MAX_VOLUME = 3_000_000
MAX_LINES = 650_000
MAX_SECONDS = 17

BANNED = {
    "eval", "exec", "open", "__import__", "getattr", "setattr", "delattr",
    "globals", "locals", "vars", "type", "compile", "input", "breakpoint",
    "__builtins__", "memoryview", "staticmethod", "classmethod", "super",
    "exit", "quit", "help", "__build_class__",
}
SAFE_NAMES = (
    "range", "len", "enumerate", "zip", "min", "max", "abs", "round",
    "int", "float", "str", "list", "dict", "set", "tuple", "sorted",
    "sum", "any", "all", "bool", "print", "reversed",
)
SAFE = {name: __builtins__[name] if isinstance(__builtins__, dict)
        else getattr(__builtins__, name) for name in SAFE_NAMES}
ID_PATTERN = re.compile(r"^[a-z0-9_.-]+:[a-z0-9_./-]+(?:\[[a-z0-9_=,.-]+\])?$")


class StripImports(ast.NodeTransformer):
    def visit_Import(self, node):
        return None

    def visit_ImportFrom(self, node):
        return None

    def generic_visit(self, node):
        node = super().generic_visit(node)
        body = getattr(node, "body", None)
        if isinstance(body, list) and not body:
            node.body = [ast.Pass()]
        return node


def run_blueprint_web(source, limit=120_000, seed=0):
    """Execute a blueprint in the browser and return JSON-serializable voxels."""
    limit = max(1, min(int(limit), 120_000))
    if len(source) > 200_000:
        raise ValueError("Code trop long pour la version navigateur.")
    tree = ast.parse(source, filename="<blueprint>")
    tree = StripImports().visit(tree)
    ast.fix_missing_locations(tree)
    for node in ast.walk(tree):
        if isinstance(node, ast.Attribute) and node.attr.startswith("_"):
            raise ValueError(f"Attribut interdit : {node.attr} (ligne {node.lineno}).")
        if isinstance(node, ast.Name) and node.id in BANNED:
            raise ValueError(f"Fonction interdite : {node.id} (ligne {node.lineno}).")

    blocks = {}
    bounds = None
    transform_stack = []
    rng = random.Random(seed)

    def coords(x, y, z):
        x, y, z = int(round(x)), int(round(y)), int(round(z))
        for op, param in transform_stack:
            if op == "translate":
                x += param[0]
                y += param[1]
                z += param[2]
            elif op == "mirror":
                axis, at = param
                if axis == "x":
                    x = 2 * at - x
                elif axis == "y":
                    y = 2 * at - y
                else:
                    z = 2 * at - z
            elif op == "rotate":
                for _ in range(param):
                    x, z = -z, x
        return x, y, z

    def check_bounds(x, y, z):
        nonlocal bounds
        if bounds is None:
            bounds = [[x, y, z], [x, y, z]]
        else:
            for i, value in enumerate((x, y, z)):
                if value - min(bounds[0][i], value) + max(bounds[1][i] - value, 0) + 1 > MAX_SPAN:
                    raise ValueError("Dimension maximale : 512 blocs par axe.")
            for i, value in enumerate((x, y, z)):
                bounds[0][i] = min(bounds[0][i], value)
                bounds[1][i] = max(bounds[1][i], value)

    def block_id(value):
        if isinstance(value, tuple) and value and value[0] == "weighted":
            picks = list(value[1].keys())
            weights = [float(value[1][k]) for k in picks]
            value = rng.choices(picks, weights=weights, k=1)[0]
        if not isinstance(value, str):
            raise ValueError("Le nom du bloc doit être une chaîne : « stone_bricks ».")
        value = value.strip().lower()
        if ":" not in value:
            value = "minecraft:" + value
        if not ID_PATTERN.fullmatch(value):
            raise ValueError(f"Identifiant de bloc invalide : {value}")
        return value

    def put(x, y, z, name):
        x, y, z = coords(x, y, z)
        key = (x, y, z)
        if key not in blocks:
            if len(blocks) >= limit:
                raise ValueError(f"Limite Web : {limit:,} blocs. Pour les grandes créations, utilise GabCon Studio local.")
            check_bounds(x, y, z)
        blocks[key] = block_id(name)

    def set_blocks(entries, block=None):
        for entry in entries:
            if len(entry) == 3:
                if block is None:
                    raise ValueError("set_blocks doit recevoir un matériau.")
                put(*entry, block)
            else:
                put(*entry[:4])

    def fill(x1, y1, z1, x2, y2, z2, name):
        for y in range(min(int(y1), int(y2)), max(int(y1), int(y2)) + 1):
            for z in range(min(int(z1), int(z2)), max(int(z1), int(z2)) + 1):
                for x in range(min(int(x1), int(x2)), max(int(x1), int(x2)) + 1):
                    put(x, y, z, name)

    def clear(x1, y1, z1, x2, y2, z2):
        for y in range(min(int(y1), int(y2)), max(int(y1), int(y2)) + 1):
            for z in range(min(int(z1), int(z2)), max(int(z1), int(z2)) + 1):
                for x in range(min(int(x1), int(x2)), max(int(x1), int(x2)) + 1):
                    blocks.pop(coords(x, y, z), None)

    def get_block(x, y, z):
        value = blocks.get(coords(x, y, z))
        if value is None:
            return None
        return value.removeprefix("minecraft:")

    def floor(x1, z1, x2, z2, y, name):
        fill(x1, y, z1, x2, y, z2, name)

    def walls(x1, z1, x2, z2, y1, y2, name, thickness=1):
        x1, x2 = sorted((int(x1), int(x2)))
        z1, z2 = sorted((int(z1), int(z2)))
        t = max(1, int(thickness))
        fill(x1, y1, z1, x2, y2, z1 + t - 1, name)
        fill(x1, y1, z2 - t + 1, x2, y2, z2, name)
        fill(x1, y1, z1, x1 + t - 1, y2, z2, name)
        fill(x2 - t + 1, y1, z1, x2, y2, z2, name)

    def hollow_box(x1, y1, z1, x2, y2, z2, name, thickness=1):
        xs, xe = sorted((int(x1), int(x2)))
        ys, ye = sorted((int(y1), int(y2)))
        zs, ze = sorted((int(z1), int(z2)))
        t = max(1, int(thickness))
        floor(xs, zs, xe, ze, ys, name)
        fill(xs, ye-t+1, zs, xe, ye, ze, name)
        walls(xs, zs, xe, ze, ys, ye, name, t)

    def cylinder(cx, cz, y, height, r, block, hollow=False):
        cx, cz, r = int(cx), int(cz), int(r)
        for dy in range(max(0, int(height))):
            for dx in range(-r, r + 1):
                for dz in range(-r, r + 1):
                    d = dx * dx + dz * dz
                    if d <= r*r and (not hollow or d >= (r-1)*(r-1)):
                        put(cx+dx, int(y)+dy, cz+dz, block)

    def sphere(cx, cy, cz, r, block, hollow=False):
        cx, cy, cz, r = int(cx), int(cy), int(cz), int(r)
        for x in range(-r,r+1):
            for y in range(-r,r+1):
                for z in range(-r,r+1):
                    d = x*x+y*y+z*z
                    if d<=r*r and (not hollow or d>=(r-1)*(r-1)):
                        put(cx+x,cy+y,cz+z,block)

    def dome(cx, cy, cz, r, block, hollow=False):
        cx,cy,cz,r = int(cx),int(cy),int(cz),int(r)
        for y in range(0,r+1):
            for x in range(-r,r+1):
                for z in range(-r,r+1):
                    d=x*x+y*y+z*z
                    if d<=r*r and (not hollow or d>=(r-1)*(r-1)):
                        put(cx+x,cy+y,cz+z,block)

    def pyramid(cx, cz, y, base, height, block, hollow=False):
        base,height=int(base),int(height)
        for level in range(height):
            span=max(0,round((base/2)*(1-level/height)))
            for x in range(-span,span+1):
                for z in range(-span,span+1):
                    if not hollow or abs(x)==span or abs(z)==span:
                        put(cx+x,y+level,cz+z,block)

    def cone(cx,cz,y,r,height,block,hollow=False):
        for level in range(int(height)):
            radius=max(0,int(round(r*(1-level/max(1,int(height))))))
            for x in range(-radius,radius+1):
                for z in range(-radius,radius+1):
                    d=x*x+z*z
                    if d<=radius*radius and (not hollow or d>=(radius-1)*(radius-1)):
                        put(cx+x,y+level,cz+z,block)

    def line(x1,y1,z1,x2,y2,z2,block):
        delta=(x2-x1,y2-y1,z2-z1)
        steps=int(max(abs(d) for d in delta))
        for i in range(steps+1):
            t=i/max(1,steps)
            put(x1+delta[0]*t,y1+delta[1]*t,z1+delta[2]*t,block)

    def frame(x1,y1,z1,x2,y2,z2,block):
        for x in (x1,x2):
            for y in (y1,y2):
                line(x,y,z1,x,y,z2,block)
        for x in (x1,x2):
            for z in (z1,z2):
                line(x,y1,z,x,y2,z,block)
        for y in (y1,y2):
            for z in (z1,z2):
                line(x1,y,z,x2,y,z,block)

    def weighted_block(weights):
        return ("weighted",weights)

    def scatter(x1,y1,z1,x2,y2,z2,block,density=0.1):
        for y in range(min(int(y1),int(y2)),max(int(y1),int(y2))+1):
            for x in range(min(int(x1),int(x2)),max(int(x1),int(x2))+1):
                for z in range(min(int(z1),int(z2)),max(int(z1),int(z2))+1):
                    if rng.random()<density:
                        put(x,y,z,block)

    def window_grid(x1,z1,x2,z2,y1,y2,block,spacing=2,margin=1):
        # Basic wall-plane window pattern (full engine offers richer variants).
        for y in range(int(y1)+int(margin),int(y2)-int(margin)+1,max(1,int(spacing))):
            for x in range(int(x1)+int(margin),int(x2)-int(margin)+1,max(1,int(spacing))):
                for z in range(int(z1)+int(margin),int(z2)-int(margin)+1,max(1,int(spacing))):
                    put(x,y,z,block)

    def gable_roof(x1,z1,x2,z2,y,block,ridge_axis="x",overhang=1):
        x1,x2=sorted((int(x1)-overhang,int(x2)+overhang))
        z1,z2=sorted((int(z1)-overhang,int(z2)+overhang))
        if ridge_axis=="z":
            mid=(x1+x2)/2
            for x in range(x1,x2+1):
                height=int(min(x-x1,x2-x))
                for z in range(z1,z2+1):
                    put(x,y+height,z,block)
        else:
            for z in range(z1,z2+1):
                height=int(min(z-z1,z2-z))
                for x in range(x1,x2+1):
                    put(x,y+height,z,block)

    def hip_roof(x1,z1,x2,z2,y,block,overhang=1):
        x1,x2=sorted((int(x1)-overhang,int(x2)+overhang))
        z1,z2=sorted((int(z1)-overhang,int(z2)+overhang))
        for x in range(x1,x2+1):
            for z in range(z1,z2+1):
                put(x,y+min(x-x1,x2-x,z-z1,z2-z),z,block)

    class Transform:
        def __init__(self, mode, arg):
            self.mode, self.arg=mode,arg
        def __enter__(self):
            transform_stack.append((self.mode,self.arg))
            return self
        def __exit__(self,*args):
            transform_stack.pop()

    def translate(dx,dy,dz):
        return Transform("translate",(int(dx),int(dy),int(dz)))
    def mirror(axis,at=0):
        if axis not in ("x","y","z"):
            raise ValueError("mirror : axe invalide.")
        return Transform("mirror",(axis,int(at)))
    def rotate_y(quarters):
        return Transform("rotate",int(quarters)%4)

    namespace={
        "__builtins__": SAFE, "math":math, "rng":rng,
        "set_block":put,"set_blocks":set_blocks,"fill":fill,"clear":clear,
        "get_block":get_block,"hollow_box":hollow_box,"walls":walls,
        "floor":floor,"line":line,"cylinder":cylinder,"sphere":sphere,
        "dome":dome,"pyramid":pyramid,"cone":cone,"gable_roof":gable_roof,
        "hip_roof":hip_roof,"weighted_block":weighted_block,"scatter":scatter,
        "frame":frame,"window_grid":window_grid,"translate":translate,
        "mirror":mirror,"rotate_y":rotate_y,
    }
    start=time.monotonic()
    events=0
    def budget(frame,event,arg):
        nonlocal events
        if frame.f_code.co_filename!="<blueprint>":
            return None
        if event=="line":
            events+=1
            if events>MAX_LINES:
                raise ValueError("Trop d'opérations Python. Réduis les boucles.")
            if events%2000==0 and time.monotonic()-start>MAX_SECONDS:
                raise ValueError("Calcul Python trop long pour le navigateur.")
        return budget

    previous=sys.gettrace()
    try:
        sys.settrace(budget)
        exec(compile(tree,"<blueprint>","exec"),namespace)
    except Exception as exc:
        raise ValueError(f"{type(exc).__name__} : {exc}") from exc
    finally:
        sys.settrace(previous)

    if not blocks:
        raise ValueError("Le blueprint n'a placé aucun bloc.")
    # Bounds can be conservative after clear(), as in the original VoxelGrid.
    minimum=[min(coord[i] for coord in blocks) for i in range(3)]
    maximum=[max(coord[i] for coord in blocks) for i in range(3)]
    dims=[maximum[i]-minimum[i]+1 for i in range(3)]
    volume=dims[0]*dims[1]*dims[2]
    if volume>MAX_VOLUME:
        raise ValueError(f"Volume trop grand ({volume:,} cases) pour l'export navigateur, maximum {MAX_VOLUME:,}.")
    palette={}
    result=[]
    for (x,y,z),name in blocks.items():
        if name not in palette:
            palette[name]=len(palette)
        result.append([x-minimum[0],y-minimum[1],z-minimum[2],palette[name]])
    counts={}
    for name,ix in palette.items():
        counts[name]=sum(1 for entry in result if entry[3]==ix)
    return json.dumps({
        "blocks":result,"palette":list(palette),
        "bounds":[minimum,maximum],"dims":dims,
        "count":len(result),"volume":volume,"seed":seed,
        "materials":sorted(counts.items(),key=lambda item:-item[1])[:10],
        "mode":"browser_python_preview",
    },separators=(",",":"))
