"""Smoke tests for the browser-only BuildAI Python DSL (without Pyodide runtime)."""
from __future__ import annotations

import json
import runpy
from pathlib import Path

execute = runpy.run_path(str(Path(__file__).resolve().parents[1] / "buildai-runtime.py"))["run_blueprint_web"]


def test_shapes_and_worldedit_export_data():
    blueprint = """
fill(-2, 0, -2, 2, 0, 2, "stone_bricks")
walls(-2, -2, 2, 2, 1, 4, "oak_planks")
cylinder(0, 0, 5, 3, 2, "cobblestone", hollow=True)
set_block(0, 1, -2, "air")
with translate(15, 0, 0):
    fill(0, 0, 0, 1, 1, 1, "glass")
"""
    result = json.loads(execute(blueprint))
    assert result["count"] > 60
    assert result["dims"][0] >= 17
    assert result["dims"][1] >= 8
    assert result["bounds"][0][0] == -2
    assert "minecraft:air" in result["palette"]
    assert "minecraft:glass" in result["palette"]
    assert all(len(entry) == 4 for entry in result["blocks"])


def test_browser_block_limit():
    try:
        execute('fill(0,0,0,19,0,19,"stone")', limit=100)
    except ValueError as exc:
        assert "Limite Web" in str(exc)
    else:
        raise AssertionError("Expected browser limit to stop runaway builds")


def test_banned_python_and_extent():
    try:
        execute('open("secret.txt", "r")')
    except ValueError as exc:
        assert "interdite" in str(exc)
    else:
        raise AssertionError("Expected AST name filter")
    try:
        execute('set_block(0,0,0,"stone")\nset_block(512,0,0,"stone")')
    except ValueError as exc:
        assert "512" in str(exc)
    else:
        raise AssertionError("Expected max extent protection")


if __name__ == "__main__":
    test_shapes_and_worldedit_export_data()
    test_browser_block_limit()
    test_banned_python_and_extent()
    print("BuildAI Web Python tests passed")
