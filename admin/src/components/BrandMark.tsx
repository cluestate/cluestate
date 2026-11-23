import React from 'react';

interface BrandMarkProps {
  size?: number;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 28 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="ClueState"
      style={{ flexShrink: 0, display: 'block' }}
    >
      {/* Anti-seam backing for faceted C-frame */}
      <path
        fill="#3D2CE0"
        d="M57 16.43L32 2L6.02 17V47L32 62L57 47.57L45 40.65L32 48.15L18 40.07V23.93L32 15.85L45 23.35Z"
      />
      {/* 5 Isometric C-frame facets */}
      <polygon fill="#3D2CE0" points="32,2 32,15.85 45,23.35 57,16.43" />
      <polygon fill="#7C8BFF" points="32,2 6.02,17 18,23.93 32,15.85" />
      <polygon fill="#5264FF" points="6.02,17 6.02,47 18,40.07 18,23.93" />
      <polygon fill="#2B25A8" points="6.02,47 32,62 32,48.15 18,40.07" />
      <polygon fill="#1D1B6E" points="57,47.57 45,40.65 32,48.15 32,62" />
      {/* Anti-seam backing for center isometric cube */}
      <polygon
        fill="#E53935"
        points="32,22.76 24,27.38 24,36.62 32,41.24 40,36.62 40,27.38"
      />
      {/* 3 Isometric cube facets */}
      <polygon fill="#F25C54" points="32,22.76 40,27.38 32,32 24,27.38" />
      <polygon fill="#E53935" points="24,27.38 32,32 32,41.24 24,36.62" />
      <polygon fill="#A81E22" points="32,32 40,27.38 40,36.62 32,41.24" />
    </svg>
  );
};
