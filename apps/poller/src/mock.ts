/** Generates synthetic dB readings that drift realistically for MOCK_MODE. */
let mockDb = 72.0;

export function nextMockReading(): number {
  // Random walk ±0.5 dB per tick, clamped to 60–115
  mockDb += (Math.random() - 0.5) * 1.0;
  mockDb = Math.max(60.0, Math.min(115.0, mockDb));
  return Math.round(mockDb * 10) / 10;
}
