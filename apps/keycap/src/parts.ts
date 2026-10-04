import { bounds, type Part } from '@bdl/geometry';
import { groundPart } from '../../coaster/src/parts.ts';

export function printPart(part: Part): Part {
  if (part.id === 'base') return groundPart(part);
  const positions = new Float32Array(part.mesh.positions);
  for (let i = 2; i < positions.length; i += 3) positions[i] *= -1;
  return groundPart({ ...part, mesh: { positions, indices: reverseFaces(part.mesh.indices) } });
}
function reverseFaces(indices: Uint32Array): Uint32Array {
  const out = new Uint32Array(indices);
  for (let i = 0; i < out.length; i += 3) [out[i + 1], out[i + 2]] = [out[i + 2], out[i + 1]];
  return out;
}
/** Cap e intarsi restano registrati tra loro, ribaltati come un unico gruppo. */
export function printAssembly(parts: readonly Part[], size: number): Part[] {
  const capGroup = parts.filter((p) => p.id !== 'base');
  const b = bounds(capGroup);
  const flipped = capGroup.map((part) => {
    const positions = new Float32Array(part.mesh.positions);
    for (let i = 0; i < positions.length; i += 3) { positions[i] += size + 15; positions[i + 2] = b.max[2] - positions[i + 2]; }
    return { ...part, mesh: { positions, indices: reverseFaces(part.mesh.indices) } };
  });
  return [...parts.filter((p) => p.id === 'base'), ...flipped];
}
