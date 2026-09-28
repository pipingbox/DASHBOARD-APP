/* One-off: independent SET-ON vector generation for H-001 fixtures.
   Derives the branch cut from the cylinder equation directly, without
   importing the engine. r = branch OD/2 (SET-ON: branch rests on header OD).

   Header axis = x. Branch axis a = (cosβ, sinβ, 0); n = (−sinβ, cosβ, 0);
   b = (0,0,1). Generator at θ: G(u) = u·a + r·(cosθ·n + sinθ·b).
   Header cylinder: y² + z² = R² → (u·sinβ + r·cosθ·cosβ)² + r²sin²θ = R²
   → s(θ) = (√(R² − r²sin²θ) − r·cosθ·cosβ) / sinβ   (u > 0 root).
*/
const R = 168.3 / 2;
const r = 88.9 / 2; // SET-ON: branch OD
const N = 24;

for (const betaDeg of [90, 45]) {
  const beta = (betaDeg * Math.PI) / 180;
  const vals: number[] = [];
  for (let i = 0; i < N; i++) {
    const th = (i * 2 * Math.PI) / N;
    const q = Math.sqrt(R * R - r * r * Math.sin(th) * Math.sin(th));
    const s = (q - r * Math.cos(th) * Math.cos(beta)) / Math.sin(beta);
    vals.push(Math.round(s * 100) / 100);
  }
  console.log(`beta=${betaDeg}°: [${vals.join(',')}]`);
  // half-profile at 15° steps for the PO comparison
  const half: string[] = [];
  for (let k = 0; k <= 6; k++) half.push(vals[k].toFixed(2));
  console.log(`  half 0..90: ${half.join(' ')}`);
  console.log(`  saddle depth: ${(vals[6] - vals[0]).toFixed(2)} (90°) / min-max check`);
  console.log(`  min=${Math.min(...vals)} max=${Math.max(...vals)} depth=${(Math.max(...vals) - Math.min(...vals)).toFixed(2)}`);
}
