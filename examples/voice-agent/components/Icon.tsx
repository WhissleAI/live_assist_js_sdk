import React from "react";

interface IconProps {
  name: string;
  size?: number;
  className?: string;
  style?: React.CSSProperties;
}

const paths: Record<string, string> = {
  mic: "M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3ZM19 10v2a7 7 0 0 1-14 0v-2M12 19v4M8 23h8",
  "file-text": "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8ZM14 2v6h6M16 13H8M16 17H8M10 9H8",
  volume2: "M11 5 6 9H2v6h4l5 4V5ZM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07",
  search: "M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16ZM21 21l-4.35-4.35",
  film: "M7 2v20M17 2v20M2 12h20M2 7h5M2 17h5M17 17h5M17 7h5M2 4.5A2.5 2.5 0 0 1 4.5 2h15A2.5 2.5 0 0 1 22 4.5v15a2.5 2.5 0 0 1-2.5 2.5h-15A2.5 2.5 0 0 1 2 19.5Z",
  "bar-chart": "M12 20V10M18 20V4M6 20v-4",
  settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2ZM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z",
  tag: "M12 2H2v10l9.29 9.29a1 1 0 0 0 1.42 0l6.58-6.58a1 1 0 0 0 0-1.42ZM7 7h.01",
  brain: "M9.5 2A5.5 5.5 0 0 0 5 5.96 5.5 5.5 0 0 0 5.96 14a5.5 5.5 0 0 0 3.54 7.9M14.5 2A5.5 5.5 0 0 1 19 5.96 5.5 5.5 0 0 1 18.04 14a5.5 5.5 0 0 1-3.54 7.9M12 2v20",
  "book-open": "M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2ZM22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7Z",
  wrench: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76Z",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  palette: "M12 2.69a9.26 9.26 0 0 0-8.62 5.77 9.3 9.3 0 0 0 2.01 10.14A9.26 9.26 0 0 0 12 21.31h.84a2 2 0 0 0 2-2v-.38a2 2 0 0 1 2-2h.25a2 2 0 0 0 2-1.49 9.36 9.36 0 0 0-5.09-11.75ZM7.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM12 7.5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3ZM16.5 12a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3Z",
  rocket: "M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09ZM12 15l-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2ZM9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5",
  zap: "M13 2 3 14h9l-1 8 10-12h-9l1-8Z",
  globe: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10A15.3 15.3 0 0 1 12 2Z",
  "chevron-left": "M15 18l-6-6 6-6",
  "chevron-right": "M9 18l6-6-6-6",
  menu: "M4 12h16M4 6h16M4 18h16",
  play: "M5 3l14 9-14 9V3Z",
  pause: "M6 4h4v16H6ZM14 4h4v16h-4Z",
  square: "M3 3h18v18H3Z",
  upload: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12",
  music: "M9 18V5l12-2v13M9 18a3 3 0 1 1-6 0 3 3 0 0 1 6 0ZM21 16a3 3 0 1 1-6 0 3 3 0 0 1 6 0Z",
  check: "M20 6 9 17l-5-5",
  x: "M18 6 6 18M6 6l12 12",
  plus: "M12 5v14M5 12h14",
  copy: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2M8 2h8v4H8V2Z",
  trash: "M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M10 11v6M14 11v6",
  "external-link": "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6M15 3h6v6M10 14 21 3",
  download: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3",
  "send": "M22 2 11 13M22 2l-7 20-4-9-9-4 20-7Z",
  clock: "M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10ZM12 6v6l4 2",
  filter: "M22 3H2l8 9.46V19l4 2v-8.54L22 3Z",
  "arrow-left": "M19 12H5M12 19l-7-7 7-7",
};

export default function Icon({ name, size = 20, className, style }: IconProps) {
  const d = paths[name];
  if (!d) return null;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      style={style}
    >
      {d.split("Z").map((segment, i, arr) => {
        // Handle paths with Z (closepath) by splitting and re-appending Z
        if (i === arr.length - 1 && !segment.trim()) return null;
        const path = i < arr.length - 1 ? segment + "Z" : segment;
        if (!path.trim()) return null;
        return <path key={i} d={path.trim()} />;
      })}
    </svg>
  );
}
