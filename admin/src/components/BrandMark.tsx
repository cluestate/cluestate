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
      <rect width="32" height="32" rx="5" fill="#161614" />
      <path
        d="M12.5 8.5H8.5V23.5H12.5"
        stroke="#F7F6F2"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
      <path
        d="M19.5 8.5H23.5V23.5H19.5"
        stroke="#F7F6F2"
        strokeWidth="2.2"
        strokeLinecap="square"
      />
      <circle cx="16" cy="16" r="2.8" fill="#C64322" />
    </svg>
  );
};
