// Smoke test a genuine gzipped Sponge v3 NBT export on Node 22.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runInNewContext } from 'node:vm';
import { gunzipSync } from 'node:zlib';

const context = {
  window: {},
  TextEncoder, Uint32Array, ArrayBuffer, DataView,
  Blob, Response, CompressionStream,
};
runInNewContext(readFileSync('buildai-schem.js', 'utf-8'), context);
const grid = {
  blocks: [[0, 0, 0, 0], [1, 0, 0, 1]],
  palette: ['minecraft:stone_bricks', 'minecraft:oak_planks'],
  dims: [2, 1, 1],
  bounds: [[-2, 0, 3], [-1, 0, 3]],
};
const blob = await context.window.GabConSchem.encodeSchem(grid);
const nbt = gunzipSync(Buffer.from(await blob.arrayBuffer()));
assert.equal(nbt[0], 10); // TAG_Compound
assert.equal(nbt.readUInt16BE(1), 0); // unnamed root
assert.ok(nbt.includes(Buffer.from('Schematic')));
assert.ok(nbt.includes(Buffer.from('Palette')));
assert.ok(nbt.includes(Buffer.from('minecraft:air')));
assert.ok(nbt.includes(Buffer.from('minecraft:stone_bricks')));
assert.ok(nbt.includes(Buffer.from('DataVersion')));
console.log('Sponge v3 schematic gzip/NBT smoke test passed');
