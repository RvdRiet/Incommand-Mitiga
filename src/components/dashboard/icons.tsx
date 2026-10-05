import type { ReactNode } from "react";

export function IconDashboard() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="3" width="7" height="7" rx="1" />
      <rect x="14" y="3" width="7" height="7" rx="1" />
      <rect x="3" y="14" width="7" height="7" rx="1" />
      <rect x="14" y="14" width="7" height="7" rx="1" />
    </svg>
  );
}

export function IconMap() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M1 6v16l7-4 8 4 7-4V2l-7 4-8-4-7 4z" />
    </svg>
  );
}

export function IconList() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <line x1="8" y1="6" x2="21" y2="6" />
      <line x1="8" y1="12" x2="21" y2="12" />
      <line x1="8" y1="18" x2="21" y2="18" />
      <circle cx="4" cy="6" r="1" fill="currentColor" />
      <circle cx="4" cy="12" r="1" fill="currentColor" />
      <circle cx="4" cy="18" r="1" fill="currentColor" />
    </svg>
  );
}

export function IconUsers() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
    </svg>
  );
}

export function IconBell() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}

export function IconHelp() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="10" />
      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
      <line x1="12" y1="17" x2="12.01" y2="17" />
    </svg>
  );
}

export function IconUser() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

export function IconCalendar() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <line x1="16" y1="2" x2="16" y2="6" />
      <line x1="8" y1="2" x2="8" y2="6" />
      <line x1="3" y1="10" x2="21" y2="10" />
    </svg>
  );
}

export function IconGear() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
    </svg>
  );
}

export function IconAward() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="9" r="6" />
      <path d="M8.5 13.5L7 22l5-3 5 3-1.5-8.5" />
    </svg>
  );
}

export function IconChart() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 3v18h18" />
      <rect x="7" y="12" width="3" height="5" />
      <rect x="12.5" y="8" width="3" height="9" />
      <rect x="18" y="5" width="3" height="12" />
    </svg>
  );
}

/* ── Navigation area + module icons (feather-style, 16px, currentColor) ── */
function nav(children: ReactNode) {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {children}
    </svg>
  );
}

export function IconChevron({ className }: { className?: string }) {
  return (
    <svg className={className} width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polyline points="9 6 15 12 9 18" />
    </svg>
  );
}

export const IconCompass = () => nav(<><circle cx="12" cy="12" r="10" /><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76" /></>);
export const IconClipboard = () => nav(<><path d="M9 2h6a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z" /><path d="M8 4H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2h-2" /></>);
export const IconFolder = () => nav(<path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />);
export const IconTruck = () => nav(<><path d="M1 5h13v11H1z" /><path d="M14 8h4l3 3v5h-7z" /><circle cx="5.5" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></>);
export const IconRadio = () => nav(<><circle cx="12" cy="12" r="2" /><path d="M7.8 7.8a6 6 0 0 0 0 8.4M16.2 16.2a6 6 0 0 0 0-8.4M4.9 4.9a10 10 0 0 0 0 14.2M19.1 19.1a10 10 0 0 0 0-14.2" /></>);
export const IconArchive = () => nav(<><rect x="3" y="4" width="18" height="4" rx="1" /><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8" /><line x1="10" y1="12" x2="14" y2="12" /></>);
export const IconFileText = () => nav(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="8" y1="13" x2="16" y2="13" /><line x1="8" y1="17" x2="13" y2="17" /></>);
export const IconMegaphone = () => nav(<><path d="M3 11v2a1 1 0 0 0 1 1h2l6 4V6L6 10H4a1 1 0 0 0-1 1z" /><path d="M15 8a5 5 0 0 1 0 8" /></>);
export const IconPlay = () => nav(<polygon points="6 4 20 12 6 20 6 4" />);
export const IconCheckSquare = () => nav(<><polyline points="9 11 12 14 20 6" /><path d="M20 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h11" /></>);
export const IconLayers = () => nav(<><polygon points="12 2 22 8.5 12 15 2 8.5 12 2" /><polyline points="2 15.5 12 22 22 15.5" /></>);
export const IconTriangleAlert = () => nav(<><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></>);
export const IconRoad = () => nav(<><path d="M6 3 4 21M18 3l2 18M12 4v2M12 10v2M12 16v2" /></>);
export const IconHome = () => nav(<><path d="M4 10.5 12 4l8 6.5" /><path d="M6 9.5V20h12V9.5" /><rect x="10" y="14" width="4" height="6" /></>);
export const IconTent = () => nav(<><path d="M12 4 3 20h18z" /><path d="M12 4v16" /></>);
export const IconZap = () => nav(<polygon points="13 2 4 14 11 14 10 22 20 9 13 9 13 2" />);
export const IconZapOff = () => nav(<><path d="M13 2 4 14h5" /><path d="M15 9h5l-7 9 1-6" /><line x1="2" y1="2" x2="22" y2="22" /></>);
export const IconRoute = () => nav(<><circle cx="6" cy="19" r="2.4" /><circle cx="18" cy="5" r="2.4" /><path d="M8.4 19H14a3 3 0 0 0 0-6h-4a3 3 0 0 1 0-6h5.6" /></>);
export const IconMapPin = () => nav(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0z" /><circle cx="12" cy="10" r="2.6" /></>);
export const IconSitemap = () => nav(<><rect x="9" y="2" width="6" height="5" rx="1" /><rect x="2" y="17" width="6" height="5" rx="1" /><rect x="16" y="17" width="6" height="5" rx="1" /><path d="M12 7v5M5 17v-2a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v2" /></>);
export const IconIdCard = () => nav(<><rect x="2" y="5" width="20" height="14" rx="2" /><circle cx="8" cy="11" r="2.2" /><path d="M5 16a3 3 0 0 1 6 0" /><line x1="14" y1="10" x2="19" y2="10" /><line x1="14" y1="14" x2="19" y2="14" /></>);
export const IconClock = () => nav(<><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15.5 14" /></>);
export const IconPackage = () => nav(<><path d="M21 8 12 3 3 8v8l9 5 9-5z" /><path d="M3 8l9 5 9-5M12 13v8" /></>);
export const IconBoxes = () => nav(<><rect x="3" y="4" width="7" height="7" rx="1" /><rect x="14" y="4" width="7" height="7" rx="1" /><rect x="8.5" y="13" width="7" height="7" rx="1" /><path d="M3 7h7M14 7h7M8.5 16h7" /></>);
export const IconRadioTower = () => nav(<><circle cx="12" cy="6" r="2" /><path d="M7.5 3a6 6 0 0 0 0 6M16.5 3a6 6 0 0 1 0 6" /><path d="M11 8 8 21M13 8l3 13M8.5 16h7" /></>);
export const IconActivity = () => nav(<polyline points="2 12 7 12 10 4 14 20 17 12 22 12" />);
export const IconBook = () => nav(<><path d="M4 4a2 2 0 0 1 2-2h13v18H6a2 2 0 0 0-2 2z" /><path d="M4 4v16" /></>);
export const IconSun = () => nav(<><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></>);
