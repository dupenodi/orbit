// Flat silhouettes on a 24×24 grid, keyed by the `icon` name in wheels.json.
export const icons = {
  screenshot:
    'M9 4h6l1.5 2H20a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h3.5zM12 8.5a4.5 4.5 0 1 0 0 9 4.5 4.5 0 0 0 0-9zm0 2a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5z',
  focus: 'M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z',
  clipboard:
    'M9 2h6a1 1 0 0 1 1 1v1h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2V3a1 1 0 0 1 1-1zm0 2v2h6V4zM8 10h8v2H8zm0 4h6v2H8z',
  terminal: 'M2 4h20v16H2zM5 9.4 6.4 8l4 4-4 4L5 14.6 7.6 12zM12 15h6v2h-6z',
  mute: 'M3 9h4l5-4.5v15L7 15H3zM15.6 10 17 8.6l2 2 2-2 1.4 1.4-2 2 2 2-1.4 1.4-2-2-2 2-1.4-1.4 2-2z',
  note: 'M3 17.3V21h3.7L17.8 9.9l-3.7-3.7zM20.7 7a1 1 0 0 0 0-1.4l-2.3-2.3a1 1 0 0 0-1.4 0l-1.8 1.8 3.7 3.7z',
  run: 'M7 4v16l13-8z',
  tile: 'M3 4h8v16H3zM13 4h8v7h-8zM13 13h8v7h-8z',
  external: 'M14 3h7v7h-2V6.4l-8.3 8.3-1.4-1.4L17.6 5H14zM5 5h6v2H5v12h12v-6h2v8H3V5z',
  branch:
    'M6 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM6 15a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM18 3a3 3 0 1 1 0 6 3 3 0 0 1 0-6zM5 9h2v6H5zM17 9h2v1a5 5 0 0 1-5 5H7v-2h7a3 3 0 0 0 3-3z',
  pull: 'M11 3h2v9.2l3.3-3.3 1.4 1.4L12 16l-5.7-5.7 1.4-1.4 3.3 3.3zM4 15h2v4h12v-4h2v6H4z',
  kill: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM8.5 7.1l3.5 3.5 3.5-3.5 1.4 1.4-3.5 3.5 3.5 3.5-1.4 1.4-3.5-3.5-3.5 3.5-1.4-1.4 3.5-3.5-3.5-3.5z',
  browser: 'M2 4h20v16H2zM4 9v9h16V9z',
  folder: 'M2 6a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2z',
  coffee: 'M7 2h2v4H7zM11 2h2v4h-2zM3 8h13v6a5 5 0 0 1-5 5H8a5 5 0 0 1-5-5zM16 9h2a3 3 0 0 1 0 6h-2v-2h2a1 1 0 0 0 0-2h-2zM2 20h16v2H2z',
  sparkle: 'M12 2l2.2 7.8L22 12l-7.8 2.2L12 22l-2.2-7.8L2 12l7.8-2.2z',
  scan: 'M3 3h6v2H5v4H3zM15 3h6v6h-2V5h-4zM3 15h2v4h4v2H3zM19 15h2v6h-6v-2h4zM7 8h10v2H7zM7 11h10v2H7zM7 14h6v2H7z',
  solo: 'M2 3h20v14H2zM4 5v10h16V5zM8 7h8v6H8zM8 19h8v2H8z',
  qr: 'M3 3h8v8H3zm2 2v4h4V5zM13 3h8v8h-8zm2 2v4h4V5zM3 13h8v8H3zm2 2v4h4v-4zM6 6h2v2H6zM16 6h2v2h-2zM6 16h2v2H6zM13 13h3v3h-3zM18 13h3v3h-3zM13 18h3v3h-3zM16 16h2v2h-2zM18 18h3v3h-3z',
  picker:
    'M19.6 3.1a2 2 0 0 0-2.8 0l-2.6 2.6-1.4-1.4-1.4 1.4 1.4 1.4-8.1 8.1V19h3.8l8.1-8.1 1.4 1.4 1.4-1.4-1.4-1.4 2.6-2.6a2 2 0 0 0 0-2.8zM8.8 17H7v-1.8l7.4-7.4 1.8 1.8z',
  theme: 'M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2v16a8 8 0 0 0 0-16z',
  playpause: 'M2 5v14l10-7zM14 5h3v14h-3zM19 5h3v14h-3z',
  timer: 'M9 1h6v2H9zM12 4a9 9 0 1 1 0 18 9 9 0 0 1 0-18zm0 2a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM11 8h2v6h-2z',
}
