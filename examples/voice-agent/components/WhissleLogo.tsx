import React from "react";

interface Props {
  size?: number;
}

/**
 * Whissle brand logo — red W waveform with blue dot and green feet.
 * SVG recreation of whissle_desktop.png used in live-assist-nextjs.
 */
export default function WhissleLogo({ size = 24 }: Props) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Left sound bars */}
      <rect x="4" y="38" width="8" height="8" rx="4" fill="#E53935" />
      <rect x="16" y="28" width="8" height="28" rx="4" fill="#E53935" />
      {/* Right sound bars */}
      <rect x="76" y="28" width="8" height="28" rx="4" fill="#E53935" />
      <rect x="88" y="38" width="8" height="8" rx="4" fill="#E53935" />
      {/* Center W waveform */}
      <path
        d="M30 18 C30 18 30 68 30 72 C30 80 38 80 38 72 L50 32 L62 72 C62 80 70 80 70 72 C70 68 70 18 70 18"
        stroke="#E53935"
        strokeWidth="9"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      {/* Blue dot */}
      <circle cx="50" cy="12" r="6" fill="#4285F4" />
      {/* Green feet */}
      <rect x="26" y="78" width="12" height="10" rx="5" fill="#124e3f" />
      <rect x="62" y="78" width="12" height="10" rx="5" fill="#124e3f" />
    </svg>
  );
}
