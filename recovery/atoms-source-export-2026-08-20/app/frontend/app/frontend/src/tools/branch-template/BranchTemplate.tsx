import { useState, useMemo } from 'react';
import {
  Scissors,
  Download,
  Ruler,
  Info,
  Printer,
  Crown,
} from 'lucide-react';
import { usePremium } from '@/hooks/usePremium';
import { PremiumGate, usePremiumGate } from '@/components/premium/PremiumGate';

/**
 * TICKET-001 Fase 4: Branch Template (Plantilla de Rama / Injerto)
 *
 * Generates the cut pattern (template) for a branch connection:
 * a pipe (branch) welded onto a pipe (run/header) at any angle.
 *
 * The template can be printed at scale 1:1, wrapped around the branch pipe,
 * and used to mark the cut line.
 *
 * Based on the standard "template method" used by pipefitters:
 * - Divide the branch circumference into 16 equal segments
 * - Calculate the cut height at each angle position
 * - Generate SVG + printable coordinate table
 *
 * Formula (lateral cut):
 *   For each angle θ (0° to 360°):
 *   h(θ) = (D_branch / 2) × cos(θ) × cot(α) + sqrt((D_run/2)² - (D_branch/2 × sin(θ))²)
 *
 * Where:
 *   D_branch = branch pipe OD
 *   D_run = run (header) pipe OD
 *   α = branch angle from run axis (90° = perpendicular)
 *
 * Reference: "Pipe Fitter's Math Guide" — Johnny Hamilton
 */

const COMMON_PIPES: { nps: string; od: number }[] = [
  { nps: '2"', od: 60.3 },
  { nps: '3"', od: 88.9 },
  { nps: '4"', od: 114.3 },
  { nps: '6"', od: 168.3 },
  { nps: '8"', od: 219.1 },
  { nps: '10"', od: 273.1 },
  { nps: '12"', od: 323.9 },
];

const NUM_SEGMENTS = 16; // standard for template method

export function BranchTemplate({ user }: { user?: { id: string } | null }) {
  const { status: premiumStatus } = usePremium();
  const { isGateOpen, gateFeature, openGate, closeGate } = usePremiumGate();
  const [runOD, setRunOD] = useState(168.3); // 6" default
  const [branchOD, setBranchOD] = useState(88.9); // 3" default
  const [angle, setAngle] = useState(90); // 90° = perpendicular

  const results = useMemo(() => {
    const runR = runOD / 2;
    const branchR = branchOD / 2;
    const angleRad = (angle * Math.PI) / 180;

    // Check if branch fits on run
    const fits = branchR <= runR;

    const segments: { angle: number; height: number; cumulativeArc: number }[] = [];
    const arcStep = (Math.PI * branchOD) / NUM_SEGMENTS; // arc length per segment

    for (let i = 0; i <= NUM_SEGMENTS; i++) {
      const theta = (2 * Math.PI * i) / NUM_SEGMENTS;
      const sinTheta = Math.sin(theta);
      const cosTheta = Math.cos(theta);

      // Lateral cut height formula
      const lateralOffset = branchR * cosTheta * (1 / Math.tan(angleRad));

      // Intersection with run pipe (if branch is smaller than run)
      const discriminant = runR * runR - branchR * branchR * sinTheta * sinTheta;
      let intersectionHeight: number;

      if (discriminant < 0) {
        // Branch doesn't intersect run at this angle (shouldn't happen if fits)
        intersectionHeight = lateralOffset;
      } else {
        intersectionHeight = lateralOffset + Math.sqrt(discriminant);
      }

      // For 90° branch, simplify
      if (angle === 90) {
        intersectionHeight = Math.sqrt(Math.max(0, runR * runR - branchR * branchR * sinTheta * sinTheta));
      }

      segments.push({
        angle: Math.round((theta * 180) / Math.PI),
        height: Math.round(intersectionHeight * 10) / 10,
        cumulativeArc: Math.round((arcStep * i) * 10) / 10,
      });
    }

    const circumference = Math.round(Math.PI * branchOD);
    const maxHeight = Math.max(...segments.map((s) => s.height));
    const minHeight = Math.min(...segments.map((s) => s.height));

    return { segments, circumference, maxHeight, minHeight, fits };
  }, [runOD, branchOD, angle]);

  const handlePrint = () => {
    if (premiumStatus.isPremium) {
      window.print();
    } else {
      openGate(
        'Printable Template (1:1 Scale)',
        'Print this branch template at true 1:1 scale. Free users can view the template on screen, but printing at exact scale requires Premium. Essential for accurate field marking.',
      );
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-[#f59e0b]/10 text-[#f59e0b] border border-[#f59e0b]/20 rounded-sm">
            Fabrication
          </span>
          <span className="px-2 py-0.5 text-[10px] uppercase tracking-wider bg-zinc-800 text-zinc-400 rounded-sm">
            Template Generator
          </span>
        </div>
        <h2 className="text-xl font-bold text-zinc-100">Branch Template (Injerto)</h2>
        <p className="text-sm text-zinc-500 max-w-2xl">
          Generate a printable cut template for branch connections (lateral/tee).
          Wrap the printed template around the branch pipe and mark the cut line.
        </p>
      </div>

      {/* Input form */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-4">
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">
              Run (Header) Pipe OD
            </label>
            <select
              value={runOD}
              onChange={(e) => setRunOD(Number(e.target.value))}
              className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:border-[#f59e0b] focus:outline-none"
            >
              {COMMON_PIPES.map((p) => (
                <option key={p.nps} value={p.od}>NPS {p.nps} — {p.od} mm</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">
              Branch Pipe OD
            </label>
            <select
              value={branchOD}
              onChange={(e) => setBranchOD(Number(e.target.value))}
              className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:border-[#f59e0b] focus:outline-none"
            >
              {COMMON_PIPES.map((p) => (
                <option key={p.nps} value={p.od}>NPS {p.nps} — {p.od} mm</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-medium">
              Branch Angle (°)
            </label>
            <select
              value={angle}
              onChange={(e) => setAngle(Number(e.target.value))}
              className="w-full rounded-sm border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 focus:border-[#f59e0b] focus:outline-none"
            >
              <option value={90}>90° (Perpendicular / Tee)</option>
              <option value={75}>75°</option>
              <option value={60}>60°</option>
              <option value={45}>45° (Lateral)</option>
              <option value={30}>30°</option>
            </select>
          </div>
        </div>

        {!results.fits && (
          <div className="flex items-center gap-2 border border-red-500/30 bg-red-500/5 rounded-sm p-3">
            <Info className="h-4 w-4 text-red-400 shrink-0" />
            <p className="text-xs text-red-300">
              Branch pipe OD is larger than run pipe OD. The branch cannot fit on the run.
            </p>
          </div>
        )}
      </div>

      {/* Summary */}
      <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
        <SummaryCard label="Branch Circumference" value={`${results.circumference} mm`} icon={Ruler} />
        <SummaryCard label="Segments" value={`${NUM_SEGMENTS + 1} points`} icon={Scissors} />
        <SummaryCard label="Max Cut Height" value={`${results.maxHeight} mm`} icon={Ruler} />
        <SummaryCard label="Min Cut Height" value={`${results.minHeight} mm`} icon={Ruler} />
      </div>

      {/* SVG template visualization */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-5 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-semibold text-zinc-200">Cut Template (Unwrapped)</h3>
          <button
            onClick={handlePrint}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-sm border text-xs transition ${
              premiumStatus.isPremium
                ? 'border-zinc-700 text-zinc-300 hover:border-[#f59e0b]/50 hover:text-[#f59e0b]'
                : 'border-[#f59e0b]/30 text-[#f59e0b] hover:bg-[#f59e0b]/10'
            }`}
          >
            {premiumStatus.isPremium ? (
              <><Printer className="h-3.5 w-3.5" /> Print (1:1 scale)</>
            ) : (
              <><Crown className="h-3.5 w-3.5" /> Print (1:1) <span className="text-[9px] uppercase tracking-wider bg-[#f59e0b]/10 px-1 rounded-sm">PRO</span></>
            )}
          </button>
        </div>

        {/* SVG: unwrapped template */}
        <div className="overflow-x-auto">
          <svg
            width="100%"
            height="280"
            viewBox="0 0 800 280"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className="border border-zinc-800/60 rounded-sm bg-zinc-950"
          >
            {/* Grid lines */}
            {[0, 100, 200, 300, 400, 500, 600, 700, 800].map((x) => (
              <line key={x} x1={x} y1="0" x2={x} y2="280" stroke="#27272a" strokeWidth="0.5" />
            ))}
            {[0, 70, 140, 210, 280].map((y) => (
              <line key={y} x1="0" y1={y} x2="800" y2={y} stroke="#27272a" strokeWidth="0.5" />
            ))}

            {/* Top line (reference) */}
            <line x1="0" y1="20" x2="800" y2="20" stroke="#52525b" strokeWidth="1" strokeDasharray="4,4" />
            <text x="10" y="15" fill="#52525b" fontSize="10">Reference line (pipe end)</text>

            {/* Cut curve */}
            {(() => {
              const maxH = results.maxHeight || 1;
              const scale = 200 / maxH; // scale heights to fit 200px
              const xStep = 780 / NUM_SEGMENTS;
              const yOffset = 250; // bottom baseline

              const points = results.segments.map((seg, i) => ({
                x: 10 + i * xStep,
                y: yOffset - seg.height * scale,
              }));

              const pathD = points
                .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`)
                .join(' ');

              return (
                <>
                  {/* Fill area */}
                  <path
                    d={`${pathD} L ${points[points.length - 1].x} ${yOffset} L ${points[0].x} ${yOffset} Z`}
                    fill="#f59e0b"
                    fillOpacity="0.08"
                  />
                  {/* Cut line */}
                  <path d={pathD} stroke="#f59e0b" strokeWidth="2" fill="none" />

                  {/* Segment markers */}
                  {points.map((p, i) => (
                    <g key={i}>
                      <circle cx={p.x} cy={p.y} r="3" fill="#f59e0b" />
                      <text x={p.x} y={p.y - 8} fill="#a1a1aa" fontSize="9" textAnchor="middle">
                        {i}
                      </text>
                    </g>
                  ))}

                  {/* Bottom line */}
                  <line x1="10" y1={yOffset} x2="790" y2={yOffset} stroke="#52525b" strokeWidth="1" />
                </>
              );
            })()}

            {/* Labels */}
            <text x="400" y="270" fill="#52525b" fontSize="10" textAnchor="middle">
              Branch circumference: {results.circumference} mm ({NUM_SEGMENTS} segments)
            </text>
          </svg>
        </div>

        <p className="text-[10px] text-zinc-500 leading-relaxed">
          The curve above shows the cut line. When printed at 1:1 scale, wrap the paper around the branch pipe
          (circumference = {results.circumference} mm), align point 0 with the seam, and mark each point.
          Connect the points with a smooth curve to get the cut line.
        </p>
      </div>

      {/* Coordinate table */}
      <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm overflow-hidden">
        <div className="p-4 border-b border-zinc-800">
          <h3 className="text-sm font-semibold text-zinc-200">Cut Coordinates Table</h3>
          <p className="text-[10px] text-zinc-500 mt-0.5">
            Measure from the reference line (pipe end). Distance along circumference = arc length from point 0.
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-zinc-800 text-[10px] uppercase tracking-wider text-zinc-500">
                <th className="text-left p-3 font-medium">Point</th>
                <th className="text-left p-3 font-medium">Angle (°)</th>
                <th className="text-left p-3 font-medium">Arc Length (mm)</th>
                <th className="text-left p-3 font-medium">Cut Height (mm)</th>
                <th className="text-left p-3 font-medium">Visual</th>
              </tr>
            </thead>
            <tbody>
              {results.segments.map((seg, i) => (
                <tr key={i} className="border-b border-zinc-800/40 hover:bg-zinc-900/30">
                  <td className="p-3 text-zinc-300 font-medium">{i}</td>
                  <td className="p-3 text-zinc-400">{seg.angle}°</td>
                  <td className="p-3 text-zinc-400">{seg.cumulativeArc}</td>
                  <td className="p-3 text-[#f59e0b] font-medium">{seg.height}</td>
                  <td className="p-3">
                    <div className="h-4 w-32 bg-zinc-800 rounded-sm overflow-hidden">
                      <div
                        className="h-full bg-[#f59e0b]/40"
                        style={{ width: `${(seg.height / results.maxHeight) * 100}%` }}
                      />
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Instructions */}
      <div className="border border-zinc-800/60 bg-[#0d0d0d] rounded-sm p-4 space-y-3">
        <h4 className="text-[10px] uppercase tracking-[0.15em] text-zinc-500 font-semibold">How to Use</h4>
        <ol className="space-y-2 text-[11px] text-zinc-400">
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">1.</span>
            Print this page at <strong className="text-zinc-300">100% scale (1:1)</strong>. Do NOT "fit to page".
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">2.</span>
            Cut out the template along the curve.
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">3.</span>
            Wrap the template around the branch pipe. The width = circumference ({results.circumference} mm).
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">4.</span>
            Align point 0 and point {NUM_SEGMENTS} at the same seam (they should meet).
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">5.</span>
            Mark each point on the pipe with a center punch or marker.
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">6.</span>
            Connect the points with a smooth curve using a flexible ruler.
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">7.</span>
            Cut along the marked line (oxy-fuel, plasma, or grinder).
          </li>
          <li className="flex gap-2">
            <span className="text-[#f59e0b] font-bold">8.</span>
            Bevel the cut edge for welding preparation (30° + 1.5mm land).
          </li>
        </ol>
      </div>

      {/* Disclaimer */}
      <div className="flex items-start gap-2 border border-amber-500/20 bg-amber-500/5 rounded-sm p-3">
        <Info className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
        <p className="text-[10px] text-zinc-500 leading-relaxed">
          This template is for {angle}° branch connections with equal wall thickness.
          For unequal wall thickness, reinforced branch (olet), or specific weld prep requirements,
          consult your welding engineer. Always verify the fit-up before welding.
          Branch on run pipe should be reinforced per ASME B31.3 if the branch ratio exceeds code limits.
        </p>
      </div>

      {/* Premium gate */}
      <PremiumGate
        open={isGateOpen}
        onClose={closeGate}
        feature={gateFeature.name}
        featureDescription={gateFeature.description}
        status={premiumStatus}
      />
    </div>
  );
}

function SummaryCard({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="border border-zinc-800/80 bg-[#0d0d0d] rounded-sm p-3 space-y-1">
      <div className="flex items-center justify-between">
        <Icon className="h-3.5 w-3.5 text-zinc-600" />
        <span className="text-[9px] uppercase tracking-wider text-zinc-600">{label}</span>
      </div>
      <p className="text-lg font-bold text-zinc-100">{value}</p>
    </div>
  );
}
