// Line icons on a 24×24 grid, keyed by the `icon` name in wheels.json. Each is
// stroked (1.75 units, round caps and joins); `fill` marks the few solid parts.

const circle = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${r * 2} 0a${r} ${r} 0 1 0 ${-r * 2} 0z`
const rect = (x, y, w, h, r) =>
  `M${x + r} ${y}h${w - 2 * r}a${r} ${r} 0 0 1 ${r} ${r}v${h - 2 * r}a${r} ${r} 0 0 1 ${-r} ${r}h${2 * r - w}a${r} ${r} 0 0 1 ${-r} ${-r}v${2 * r - h}a${r} ${r} 0 0 1 ${r} ${-r}z`
// Round-capped zero-length strokes render as dots.
const dot = (x, y) => `M${x} ${y}h.01`

export const icons = {
  scan: { stroke: 'M4 8.5V6.5A2.5 2.5 0 0 1 6.5 4h2M15.5 4h2A2.5 2.5 0 0 1 20 6.5v2M20 15.5v2a2.5 2.5 0 0 1-2.5 2.5h-2M8.5 20h-2A2.5 2.5 0 0 1 4 17.5v-2M8 9.5h8M8 12.25h8M8 15h5' },
  screenshot: {
    stroke: `M3.5 9a2.25 2.25 0 0 1 2.25-2.25h1.9L9.1 4.5h5.8l1.45 2.25h1.9A2.25 2.25 0 0 1 20.5 9v8.25a2.25 2.25 0 0 1-2.25 2.25H5.75a2.25 2.25 0 0 1-2.25-2.25z${circle(12, 13, 3.25)}`,
  },
  qr: {
    stroke: `${rect(4, 4, 6, 6, 1.25)}${rect(14, 4, 6, 6, 1.25)}${rect(4, 14, 6, 6, 1.25)}`,
    fill: [[7, 7], [17, 7], [7, 17], [14.75, 14.75], [19.25, 14.75], [17, 17], [14.75, 19.25], [19.25, 19.25]].map(([x, y]) => circle(x, y, 1.1)).join(''),
  },
  picker: { stroke: 'M13.25 7.75l3 3M4.5 19.5l1.6-.4a1.6 1.6 0 0 0 .75-.42l7.9-7.9-3-3-7.9 7.9a1.6 1.6 0 0 0-.42.75zM14.75 6.25l1.9-1.9a2.12 2.12 0 0 1 3 3l-1.9 1.9M12.25 4.75l7 7' },
  theme: { stroke: circle(12, 12, 8.25), fill: 'M12 3.75a8.25 8.25 0 0 1 0 16.5z' },
  playpause: { stroke: 'M4.5 6.6v10.8a.6.6 0 0 0 .93.5l7.9-5.4a.6.6 0 0 0 0-1l-7.9-5.4a.6.6 0 0 0-.93.5zM16.75 6.5v11M20.25 6.5v11' },
  mic: { stroke: `${rect(9, 3.5, 6, 11, 3)}M5.75 11.25a6.25 6.25 0 0 0 12.5 0M12 17.5v3M9 20.5h6` },
  timer: { stroke: `${circle(12, 13.5, 7)}M12 10.25v3.25M10 3.5h4M12 3.5v3M18 6.5l1.25-1.25` },
  mute: { stroke: 'M4 9.6a.6.6 0 0 1 .6-.6H7.5L11 5.6a.6.6 0 0 1 1 .44v11.92a.6.6 0 0 1-1 .44L7.5 15H4.6a.6.6 0 0 1-.6-.6zM15.75 9.75l4.5 4.5M20.25 9.75l-4.5 4.5' },
  focus: { stroke: 'M19.5 14.25A7.5 7.5 0 0 1 9.75 4.5a7.75 7.75 0 1 0 9.75 9.75z' },
  clipboard: { stroke: `M8.5 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-1.5${rect(8.5, 3, 7, 4, 1)}M9 11.5h6M9 15h4` },
  terminal: { stroke: `${rect(3, 4.5, 18, 15, 2.5)}M7.5 9.5 10 12l-2.5 2.5M12.5 14.75h4` },
  note: { stroke: 'M4.5 19.5l.9-3.6L15.6 5.7a2.12 2.12 0 0 1 3 3L8.4 18.9zM13.75 7.5l3 3' },
  run: { stroke: 'M7 5.4v13.2a.75.75 0 0 0 1.14.64l10.6-6.6a.75.75 0 0 0 0-1.28L8.14 4.76A.75.75 0 0 0 7 5.4z' },
  tile: { stroke: `${rect(3.5, 4, 7.5, 16, 2)}${rect(13, 4, 7.5, 7, 2)}${rect(13, 13, 7.5, 7, 2)}` },
  external: { stroke: 'M14 4h6v6M20 4l-8.5 8.5M18 13.5v4.5a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4.5' },
  branch: { stroke: `${circle(6.5, 5.5, 2)}${circle(6.5, 18.5, 2)}${circle(17.5, 6.5, 2)}M6.5 7.5v9M17.5 8.5v.5a4 4 0 0 1-4 4h-3a4 4 0 0 0-4 3.5` },
  pull: { stroke: 'M12 4v11M7.5 10.5 12 15l4.5-4.5M4.5 15.5v2.75A1.75 1.75 0 0 0 6.25 20h11.5a1.75 1.75 0 0 0 1.75-1.75V15.5' },
  kill: { stroke: `${circle(12, 12, 8.5)}M9.25 9.25l5.5 5.5M14.75 9.25l-5.5 5.5` },
  browser: { stroke: `${rect(3, 4.5, 18, 15, 2.5)}M3 9h18${dot(6, 6.75)}${dot(8.5, 6.75)}` },
  folder: { stroke: 'M3.5 7.25A2.25 2.25 0 0 1 5.75 5h3.4l2 2.25h7.1a2.25 2.25 0 0 1 2.25 2.25v8.25A2.25 2.25 0 0 1 18.25 20H5.75A2.25 2.25 0 0 1 3.5 17.75z' },
  coffee: { stroke: 'M4.5 9.5h11v4.25A5.25 5.25 0 0 1 10.25 19h-.5A5.25 5.25 0 0 1 4.5 13.75zM15.5 10.5h1.25a2.5 2.5 0 0 1 0 5H15M8 3.5v3M12 3.5v3' },
  sparkle: { stroke: 'M12 4c.6 4.6 3.4 7.4 8 8-4.6.6-7.4 3.4-8 8-.6-4.6-3.4-7.4-8-8 4.6-.6 7.4-3.4 8-8z' },
  solo: { stroke: `${rect(3, 4, 18, 13, 2.5)}${rect(7.5, 7.5, 9, 6, 1)}M9 20.5h6` },
  // Onboarding's permission rows.
  accessibility: { stroke: `${circle(12, 12, 8.5)}M8 9.75l4 1 4-1M12 10.75v3.25M9.75 17.25 12 14l2.25 3.25`, fill: circle(12, 7.25, 1.25) },
  screen: { stroke: `${rect(3, 4, 18, 12.5, 2.5)}M12 16.5V20M8.5 20h7` },
  automation: { stroke: 'M4.5 19.5l10-10M13 8l3 3M17.5 3.5v3M16 5h3M20 10.5v2M19 11.5h2M9 4v2M8 5h2' },
  check: { stroke: 'M5.5 12.5l4 4 9-9' },
  alert: { stroke: 'M12 7.5v5.5', fill: circle(12, 16.5, 1.15) },
}

// Draws an icon into an existing SVG node (any element that takes children).
export function appendIcon(doc, parent, name) {
  const icon = icons[name]
  if (!icon) return false
  const NS = 'http://www.w3.org/2000/svg'
  if (icon.stroke) {
    const path = doc.createElementNS(NS, 'path')
    path.setAttribute('d', icon.stroke)
    path.setAttribute('class', 'icon-stroke')
    path.setAttribute('fill', 'none')
    path.setAttribute('stroke', 'currentColor')
    path.setAttribute('stroke-width', '1.75')
    path.setAttribute('stroke-linecap', 'round')
    path.setAttribute('stroke-linejoin', 'round')
    parent.append(path)
  }
  if (icon.fill) {
    const path = doc.createElementNS(NS, 'path')
    path.setAttribute('d', icon.fill)
    path.setAttribute('class', 'icon-fill')
    path.setAttribute('fill', 'currentColor')
    parent.append(path)
  }
  return true
}

// A standalone <svg> for HTML pages.
export function iconSvg(doc, name, className) {
  const svg = doc.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', '0 0 24 24')
  svg.setAttribute('aria-hidden', 'true')
  if (className) svg.setAttribute('class', className)
  appendIcon(doc, svg, name)
  return svg
}
