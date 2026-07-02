import type { ReactElement } from "react";
import { ResponsiveContainer } from "recharts";
import { SURFACE, LINE, INK } from "../theme";

// ChartFrame — the shared Recharts chrome that was copy-pasted per chart:
// tooltip contentStyle, axis tick styling, grid color, margins. Charts opt in
// by wrapping in <ChartFrame> and spreading the prop bundles below. Recharts
// resolves children by component type, so axes/grid/tooltip cannot be wrapped
// in intermediate components — they take prop-object spreads instead:
//
//   <ChartFrame height={360}>
//     <LineChart data={rows} margin={CHART_MARGIN}>
//       <CartesianGrid {...gridProps} />
//       <XAxis dataKey="date" {...axisProps} minTickGap={60} />
//       <YAxis {...axisProps} width={56} />
//       <Tooltip {...tooltipProps} />
//     </LineChart>
//   </ChartFrame>

/** Default plot margins — RegimeRibbon relies on these to align its strip. */
export const CHART_MARGIN = { top: 8, right: 16, bottom: 0, left: 4 } as const;

/** Axis tick styling (ticks are chrome: muted ink, small). */
export const axisProps = {
  tick: { fill: INK.mute, fontSize: 11 },
  stroke: LINE.line,
  tickLine: false as const,
  axisLine: { stroke: LINE.line },
};

/** Recessive horizontal gridlines only. */
export const gridProps = {
  stroke: SURFACE.raised,
  vertical: false as const,
};

/** Shared tooltip chrome. */
export const tooltipProps = {
  contentStyle: {
    background: SURFACE.head,
    border: `1px solid ${LINE.line}`,
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: INK.ink2 },
  itemStyle: { paddingTop: 0, paddingBottom: 0 },
};

/** Shared legend chrome. */
export const legendProps = {
  wrapperStyle: { fontSize: 11 },
};

export default function ChartFrame({ height, className, children }: {
  height: number;
  className?: string;
  /** exactly one Recharts chart element */
  children: ReactElement;
}) {
  return (
    <div className={className}>
      <ResponsiveContainer width="100%" height={height}>
        {children}
      </ResponsiveContainer>
    </div>
  );
}
