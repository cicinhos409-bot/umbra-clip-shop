import React, { useId } from "react";

interface LogoProps {
  size?: number;
  className?: string;
}

/**
 * Umbra Copywriter brand mark.
 * Concept: "umbra" = the dark core of an eclipse — an amber crescent inside a
 * black badge, with a spark. Black + amber identity.
 */
export default function Logo({ size = 40, className = "" }: LogoProps) {
  const uid = useId().replace(/:/g, "");
  const amber = `umbra-amber-${uid}`;
  const dark = `umbra-dark-${uid}`;
  const moon = `umbra-moon-${uid}`;

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      role="img"
      aria-label="Umbra Copywriter"
    >
      <defs>
        <linearGradient id={amber} x1="6" y1="10" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop stopColor="#fcd34d" />
          <stop offset="0.55" stopColor="#f59e0b" />
          <stop offset="1" stopColor="#d97706" />
        </linearGradient>
        <linearGradient id={dark} x1="24" y1="1" x2="24" y2="47" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1c1c20" />
          <stop offset="1" stopColor="#09090b" />
        </linearGradient>
        <mask id={moon}>
          <circle cx="22" cy="24.5" r="11.5" fill="white" />
          <circle cx="28" cy="20.5" r="9.8" fill="black" />
        </mask>
      </defs>

      {/* Black badge */}
      <rect
        x="1"
        y="1"
        width="46"
        height="46"
        rx="12"
        fill={`url(#${dark})`}
        stroke="#f59e0b"
        strokeOpacity="0.35"
        strokeWidth="1.5"
      />

      {/* Amber eclipse crescent (the "umbra") */}
      <g mask={`url(#${moon})`}>
        <circle cx="22" cy="24.5" r="11.5" fill={`url(#${amber})`} />
      </g>

      {/* Spark */}
      <path
        d="M34.5 9C35.1 12 35.8 12.7 38.8 13.3C35.8 13.9 35.1 14.6 34.5 17.6C33.9 14.6 33.2 13.9 30.2 13.3C33.2 12.7 33.9 12 34.5 9Z"
        fill="#fcd34d"
      />
    </svg>
  );
}
