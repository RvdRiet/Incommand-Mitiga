/**
 * Shared line-icon set (feather-style: 24-grid, stroke=currentColor, width 1.9).
 * Replaces emoji used as UI icons across the app so controls read as designed,
 * not improvised. Each takes an optional `size` (px).
 */
type IconProps = { size?: number };

function svg(size: number, children: React.ReactNode) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.9}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {children}
    </svg>
  );
}

export const IconCamera = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z" />
      <circle cx="12" cy="13" r="3.2" />
    </>
  ));

export const IconVideo = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <rect x="2.5" y="6" width="13" height="12" rx="2" />
      <path d="M15.5 10l6-3v10l-6-3" />
    </>
  ));

export const IconScan = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M4 8V5.5A1.5 1.5 0 0 1 5.5 4H8M16 4h2.5A1.5 1.5 0 0 1 20 5.5V8M20 16v2.5a1.5 1.5 0 0 1-1.5 1.5H16M8 20H5.5A1.5 1.5 0 0 1 4 18.5V16" />
      <line x1="4" y1="12" x2="20" y2="12" />
    </>
  ));

export const IconSend = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M21 3L10.5 13.5" />
      <path d="M21 3l-6.5 18-4-8-8-4L21 3z" />
    </>
  ));

export const IconTarget = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="3" />
      <path d="M12 1v3M12 20v3M1 12h3M20 12h3" />
    </>
  ));

export const IconBolt = ({ size = 16 }: IconProps) =>
  svg(size, <path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13l0-8z" />);

export const IconDroplet = ({ size = 16 }: IconProps) =>
  svg(size, <path d="M12 2.7l5.5 6.8a7 7 0 1 1-11 0L12 2.7z" />);

export const IconPin = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M12 21s7-6.2 7-11a7 7 0 0 0-14 0c0 4.8 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.5" />
    </>
  ));

export const IconPlay = ({ size = 16 }: IconProps) =>
  svg(size, <path d="M7 4.5l12 7.5-12 7.5v-15z" />);

export const IconPause = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <rect x="6" y="5" width="4" height="14" rx="1" />
      <rect x="14" y="5" width="4" height="14" rx="1" />
    </>
  ));

export const IconMic = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <rect x="9" y="2.5" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
    </>
  ));

export const IconVolume = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M4 9v6h4l5 4V5L8 9H4z" />
      <path d="M17 8.5a4 4 0 0 1 0 7" />
    </>
  ));

export const IconInfo = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5M12 8h.01" />
    </>
  ));

export const IconRefresh = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M20 11a8 8 0 1 0-1.6 5" />
      <path d="M20 4v5h-5" />
    </>
  ));

export const IconMenu = ({ size = 18 }: IconProps) =>
  svg(size, <path d="M4 7h16M4 12h16M4 17h16" />);

export const IconAlertTriangle = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M10.3 3.6L1.8 18a2 2 0 0 0 1.7 3h16.9a2 2 0 0 0 1.7-3L13.7 3.6a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </>
  ));

export const IconArrowRight = ({ size = 16 }: IconProps) =>
  svg(size, <path d="M5 12h14M13 6l6 6-6 6" />);

export const IconArrowLeft = ({ size = 16 }: IconProps) =>
  svg(size, <path d="M19 12H5M11 18l-6-6 6-6" />);

/* --- Weather --- */
export const IconCloudSun = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M7 6.5a3.5 3.5 0 0 1 6.9-.8" />
      <path d="M4 4.5v1.5M1.5 8H3M6.2 5.2l1 1M18 10.5v1.5" />
      <path d="M8 19h9a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 8 13.2 3 3 0 0 0 8 19z" />
    </>
  ));

export const IconRain = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M7 15h9a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7 9.2 3 3 0 0 0 7 15z" />
      <path d="M8 18.5v2M12 18.5v2.5M16 18.5v2" />
    </>
  ));

export const IconWind = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M3 8h10a2.5 2.5 0 1 0-2.5-2.5" />
      <path d="M3 12h15a2.5 2.5 0 1 1-2.5 2.5" />
      <path d="M3 16h7a2 2 0 1 1-2 2" />
    </>
  ));

export const IconStorm = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M7 14h9a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7 8.2 3 3 0 0 0 7 14z" />
      <path d="M12 12l-2.5 4H12l-1 4 3.5-5H12l1-3z" />
    </>
  ));

export const IconFog = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M6 11h9a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 6 6.2 3 3 0 0 0 6 11z" />
      <path d="M4 15h13M6 18.5h11" />
    </>
  ));

export const IconSun = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M19.1 4.9l-1.8 1.8M6.7 17.3l-1.8 1.8" />
    </>
  ));

export const IconCloud = ({ size = 16 }: IconProps) =>
  svg(size, <path d="M7 18h9a4 4 0 0 0 .3-8A5.5 5.5 0 0 0 7 11.5 3.5 3.5 0 0 0 7 18z" />);

export const IconSnow = ({ size = 16 }: IconProps) =>
  svg(size, (
    <>
      <path d="M7 15h9a3.5 3.5 0 0 0 .3-7A5 5 0 0 0 7 9.2 3 3 0 0 0 7 15z" />
      <path d="M8.5 18.5h.01M12 20h.01M15.5 18.5h.01" />
    </>
  ));

/** Weather-condition icon keyed by the WMO severity band (clear/cloud/fog/rain/snow/storm). */
export function WeatherConditionIcon({ severity, size = 16 }: { severity: string; size?: number }) {
  switch (severity) {
    case "clear":
      return <IconSun size={size} />;
    case "fog":
      return <IconFog size={size} />;
    case "rain":
      return <IconRain size={size} />;
    case "snow":
      return <IconSnow size={size} />;
    case "storm":
      return <IconStorm size={size} />;
    default:
      return <IconCloud size={size} />;
  }
}
