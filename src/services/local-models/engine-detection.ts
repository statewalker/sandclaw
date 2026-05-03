/**
 * Synchronous WebGPU presence check. Does **not** call
 * `navigator.gpu.requestAdapter()` — that probe runs at activation time and
 * surfaces its own errors.
 */
export function webGpuAvailable(): boolean {
  return (
    typeof navigator !== "undefined" &&
    "gpu" in navigator &&
    (navigator as Navigator & { gpu?: unknown }).gpu != null
  );
}
