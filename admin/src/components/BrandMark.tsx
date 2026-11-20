import React from 'react';

interface BrandMarkProps {
  size?: number;
}

export const BrandMark: React.FC<BrandMarkProps> = ({ size = 28 }) => {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      style={{ flexShrink: 0, display: 'block' }}
    >
      <path
        d="M12.5 6.5H6.5V25.5H12.5"
        stroke="#3D2CE0"
        strokeWidth="2.8"
        strokeLinecap="square"
      />
      <path
        d="M19.5 6.5H25.5V25.5H19.5"
        stroke="#3D2CE0"
        strokeWidth="2.8"
        strokeLinecap="square"
      />
      <rect x="13" y="13" width="6" height="6" fill="#E53935" />
    </svg>
  );
};
