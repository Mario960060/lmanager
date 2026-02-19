import React from 'react';

interface KerbVisualizationProps {
  kerbWidth: number;  // in cm
  kerbHeight: number; // in cm
  baseHeight: number; // mortar height below kerb in cm
  leftHunchPercent: number;  // 0.8 for 80%, 0.5 for 50%, 0.2 for 20%
  rightHunchPercent: number; // same as above
  title: string;
  isFlat?: boolean;
}

const KerbVisualization: React.FC<KerbVisualizationProps> = ({
  kerbWidth,
  kerbHeight,
  baseHeight,
  leftHunchPercent,
  rightHunchPercent,
  title,
  isFlat = false
}) => {
  // Scale factors to fit SVG (1cm = 2px)
  const scale = 2;
  const margin = 20;
  
  // Front view dimensions:
  // Standing: width=8cm (actual width), height=20cm
  // Flat: width=8cm (same width), height=15cm (original length)
  const displayWidth = 8;  // Always 8cm width from front view
  const displayHeight = isFlat ? 15 : 20; // 15cm when flat (length), 20cm when standing
  
  // Center the kerb
  const centerX = margin + (displayWidth * scale) / 2;
  
  const getHunchPath = (side: 'left' | 'right', percent: number) => {
    const hunchHeight = displayHeight * percent;
    const hunchWidth = displayWidth; // Each hunch extends one kerb width
    const kerbSideX = centerX + (side === 'left' ? -1 : 1) * (displayWidth / 2) * scale;
    const hunchEndX = kerbSideX + (side === 'left' ? -hunchWidth : hunchWidth) * scale;
    
    const kerbBottomY = margin + displayHeight * scale;
    const hunchTopY = margin + (displayHeight - hunchHeight) * scale;
    
    return `
      M ${kerbSideX} ${kerbBottomY}
      L ${hunchEndX} ${kerbBottomY}
      L ${kerbSideX} ${hunchTopY}
      Z
    `;
  };

  // Draw the base mortar
  const getBaseMortarPath = () => {
    const leftX = centerX - (displayWidth * 1.5) * scale;
    const rightX = centerX + (displayWidth * 1.5) * scale;
    const y = margin + displayHeight * scale;
    
    return {
      x: leftX,
      y: y,
      width: rightX - leftX,
      height: baseHeight * scale
    };
  };

  // Calculate SVG dimensions - baseHeight only affects the bottom extension
  const svgWidth = (displayWidth * 3) * scale + 2 * margin;
  const svgHeight = (displayHeight + baseHeight) * scale + 2 * margin;

  return (
    <div className="flex flex-col items-center mb-4">
      <h3 className="text-sm font-medium mb-2">{title}</h3>
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        className="border border-gray-300 rounded"
      >
        {/* Base mortar */}
        <rect
          {...getBaseMortarPath()}
          fill="#E5E7EB"
          opacity={0.9}
        />
        
        {/* Left hunch */}
        {leftHunchPercent > 0 && (
          <path
            d={getHunchPath('left', leftHunchPercent)}
            fill="#E5E7EB"
            opacity={0.9}
          />
        )}
        
        {/* Right hunch */}
        {rightHunchPercent > 0 && (
          <path
            d={getHunchPath('right', rightHunchPercent)}
            fill="#E5E7EB"
            opacity={0.9}
          />
        )}
        
        {/* Kerb */}
        <rect
          x={centerX - (displayWidth * scale) / 2}
          y={margin}
          width={displayWidth * scale}
          height={displayHeight * scale}
          fill="#FFFFFF"
          stroke="#E5E7EB"
          strokeWidth="1"
        />
        
        {/* Dimensions */}
        <text
          x={centerX}
          y={margin - 5}
          textAnchor="middle"
          className="text-xs"
          fill="#2563EB"
        >
          {displayWidth}cm
        </text>
        <text
          x={centerX + (displayWidth * scale) / 2 + 15}
          y={margin + (displayHeight * scale) / 2}
          textAnchor="start"
          className="text-xs"
          fill="#2563EB"
        >
          {displayHeight}cm
        </text>
        <text
          x={centerX}
          y={svgHeight - 5}
          textAnchor="middle"
          className="text-xs"
          fill="#2563EB"
        >
          {baseHeight}cm
        </text>
      </svg>
    </div>
  );
};

export default KerbVisualization;
