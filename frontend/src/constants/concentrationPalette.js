/** Largest-holdings donut, legend dots, and trade snapshot row markers: dark → light brown. */
export const CONCENTRATION_SLICE_COLORS = [
  "#3B2506",
  "#6B4C2A",
  "#A67C52",
  "#C8A882",
  "#E8D5B7",
];

export function concentrationSliceColor(index) {
  return CONCENTRATION_SLICE_COLORS[index % CONCENTRATION_SLICE_COLORS.length];
}
