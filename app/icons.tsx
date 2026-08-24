// Set de íconos compartido — antes vivía duplicado (con leves diferencias)
// en LampDashboard.tsx y en ConfiguracionView.tsx, lo que causaba que el
// sidebar se viera distinto entre pantallas cuando alguno de los dos se
// editaba y el otro no. Ahora es un solo archivo que importan todas las
// pantallas (Dashboard, Configuración, Historial), así que no se pueden
// volver a desincronizar.
export type IconName =
  | "home"
  | "settings"
  | "history"
  | "headset"
  | "sun"
  | "calendar"
  | "clock"
  | "wifi"
  | "lamp"
  | "power"
  | "search"
  | "grid"
  | "list"
  | "check"
  | "refresh"
  | "chevron"
  | "hand"
  | "arrowUp"
  | "arrowDown"
  | "more"
  | "close"
  | "menu";

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  const common = {
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.9,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };
  const paths: Record<IconName, React.ReactNode> = {
    home: <><path d="m3 10 9-7 9 7"/><path d="M5 9v11h14V9M9 20v-7h6v7"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.88l.06.06-2.83 2.83-.06-.06a1.7 1.7 0 0 0-1.88-.34 1.7 1.7 0 0 0-1.03 1.56V21h-4v-.08A1.7 1.7 0 0 0 8.95 19.4a1.7 1.7 0 0 0-1.88.34l-.06.06-2.83-2.83.06-.06A1.7 1.7 0 0 0 4.6 15 1.7 1.7 0 0 0 3 14H3v-4h.08A1.7 1.7 0 0 0 4.6 9a1.7 1.7 0 0 0-.34-1.88l-.06-.06 2.83-2.83.06.06A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V3h4v.08A1.7 1.7 0 0 0 15 4.6a1.7 1.7 0 0 0 1.88-.34l.06-.06 2.83 2.83-.06.06A1.7 1.7 0 0 0 19.4 9 1.7 1.7 0 0 0 21 10v4a1.7 1.7 0 0 0-1.6 1Z"/></>,
    history: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    headset: <><path d="M4 14v-2a8 8 0 0 1 16 0v2"/><path d="M4 14h3v6H5a2 2 0 0 1-2-2v-2a2 2 0 0 1 1-2Zm16 0h-3v6h2a2 2 0 0 0 2-2v-2a2 2 0 0 0-1-2Z"/></>,
    sun: <><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M2 12h2m16 0h2M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    wifi: <><path d="M5 9.5a10 10 0 0 1 14 0M8 13a6 6 0 0 1 8 0M11 16.5a2 2 0 0 1 2 0"/><circle cx="12" cy="19" r=".5" fill="currentColor"/></>,
    lamp: <><path d="M8 15h8M9 15l-1-3a4 4 0 0 1 8 0l-1 3M12 15v5M10 20h4"/></>,
    power: <><path d="M12 2v10"/><path d="M18.4 5.6a9 9 0 1 1-12.8 0"/></>,
    search: <><circle cx="10.5" cy="10.5" r="6.5"/><path d="m16 16 4 4"/></>,
    grid: <><rect x="4" y="4" width="6" height="6"/><rect x="14" y="4" width="6" height="6"/><rect x="4" y="14" width="6" height="6"/><rect x="14" y="14" width="6" height="6"/></>,
    list: <><path d="M9 6h11M9 12h11M9 18h11"/><circle cx="5" cy="6" r="1" fill="currentColor"/><circle cx="5" cy="12" r="1" fill="currentColor"/><circle cx="5" cy="18" r="1" fill="currentColor"/></>,
    check: <path d="m5 12 4.5 4.5L19 7"/>, refresh: <><path d="M20 7v5h-5"/><path d="M4 17v-5h5M18.5 9A7 7 0 0 0 6 6.5L4 9m16 6-2 2.5A7 7 0 0 1 5.5 15"/></>,
    chevron: <path d="m9 18 6-6-6-6"/>, hand: <path d="M8 11V6a1.5 1.5 0 0 1 3 0v4-6a1.5 1.5 0 0 1 3 0v6-4a1.5 1.5 0 0 1 3 0v5-2a1.5 1.5 0 0 1 3 0v4c0 5-3 8-8 8h-1c-2 0-3.5-1-5-3l-3-4a1.7 1.7 0 0 1 2.7-2l2.3 2"/>,
    arrowUp: <><path d="m7 11 5-5 5 5M12 6v12"/></>, arrowDown: <><path d="m7 13 5 5 5-5M12 18V6"/></>, more: <><circle cx="12" cy="5" r="1" fill="currentColor"/><circle cx="12" cy="12" r="1" fill="currentColor"/><circle cx="12" cy="19" r="1" fill="currentColor"/></>,
    close: <><path d="M6 6l12 12"/><path d="M18 6 6 18"/></>,
    menu: <><path d="M4 6h16M4 12h16M4 18h16"/></>,
  };
  return <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" {...common}>{paths[name]}</svg>;
}
