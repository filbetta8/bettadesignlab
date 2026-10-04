import { bounds, type Part } from '@bdl/geometry';

/** Copia indipendente, centrata in XY e appoggiata sul piano di stampa. */
export function groundPart(part: Part): Part {
  const b = bounds([part]);
  const positions = new Float32Array(part.mesh.positions);
  for (let i = 0; i < positions.length; i += 3) {
    positions[i] -= (b.min[0] + b.max[0]) / 2;
    positions[i + 1] -= (b.min[1] + b.max[1]) / 2;
    positions[i + 2] -= b.min[2];
  }
  return { ...part, mesh: { positions, indices: part.mesh.indices } };
}

/** Disposizione su griglia, senza sovrapposizioni; non modifica l'assemblato. */
export function separateParts(parts: readonly Part[]): Part[] {
  const copies = parts.map(groundPart);
  const columns = Math.ceil(Math.sqrt(copies.length));
  const sizes = copies.map((part) => bounds([part]));
  const cellX = Math.max(0, ...sizes.map((b) => b.max[0] - b.min[0])) + 8;
  const cellY = Math.max(0, ...sizes.map((b) => b.max[1] - b.min[1])) + 8;
  const rows = Math.ceil(copies.length / columns);
  copies.forEach((part, index) => {
    const x = (index % columns - (columns - 1) / 2) * cellX;
    const y = (Math.floor(index / columns) - (rows - 1) / 2) * cellY;
    for (let i = 0; i < part.mesh.positions.length; i += 3) {
      part.mesh.positions[i] += x;
      part.mesh.positions[i + 1] += y;
    }
  });
  return copies;
}
