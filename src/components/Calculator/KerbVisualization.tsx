import React from 'react';
import { colors, radii } from '../../themes/designTokens';

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
  const MAX_DISPLAY_DEPTH = 100; // Cap visual height at 100cm
  
  // Front view dimensions:
  // Standing: width=8cm (actual width), height=20cm
  // Flat: width=8cm (same width), height=15cm (original length)
  const displayWidth = 8;  // Always 8cm width from front view
  const displayHeight = isFlat ? 15 : 20; // 15cm when flat (length), 20cm when standing
  const displayBaseHeight = Math.min(baseHeight, MAX_DISPLAY_DEPTH); // Cap at 100cm for visual
  
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
      height: displayBaseHeight * scale
    };
  };

  // Calculate SVG dimensions - capped at 100cm for baseHeight
  const svgWidth = (displayWidth * 3) * scale + 2 * margin;
  const svgHeight = (displayHeight + displayBaseHeight) * scale + 2 * margin;

  // Base mortar center Y for label placement (długość zaprawy pod hunch - z boku, na środku)
  const baseMortarCenterY = margin + displayHeight * scale + (displayBaseHeight * scale) / 2;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: 16 }}>
      <h3 style={{ fontSize: 14, fontWeight: 500, marginBottom: 8, color: colors.textSecondary }}>{title}</h3>
      <svg
        width={svgWidth}
        height={svgHeight}
        viewBox={`0 0 ${svgWidth} ${svgHeight}`}
        style={{ border: `1px solid ${colors.borderDefault}`, borderRadius: radii.sm }}
      >
        {/* Base mortar */}
        <rect
          {...getBaseMortarPath()}
          fill={colors.diagramFill}
          opacity={0.9}
        />
        
        {/* Left hunch */}
        {leftHunchPercent > 0 && (
          <path
            d={getHunchPath('left', leftHunchPercent)}
            fill={colors.diagramFill}
            opacity={0.9}
          />
        )}
        
        {/* Right hunch */}
        {rightHunchPercent > 0 && (
          <path
            d={getHunchPath('right', rightHunchPercent)}
            fill={colors.diagramFill}
            opacity={0.9}
          />
        )}
        
        {/* Kerb */}
        <rect
          x={centerX - (displayWidth * scale) / 2}
          y={margin}
          width={displayWidth * scale}
          height={displayHeight * scale}
          fill={colors.textOnAccent}
          stroke={colors.diagramStroke}
          strokeWidth="1"
        />
        
        {/* Dimensions */}
        <text
          x={centerX}
          y={margin - 5}
          textAnchor="middle"
          style={{ fontSize: 12 }}
          fill={colors.accentBlueDark}
        >
          {displayWidth}cm
        </text>
        <text
          x={centerX + (displayWidth * scale) / 2 + 15}
          y={margin + (displayHeight * scale) / 2}
          textAnchor="start"
          style={{ fontSize: 12 }}
          fill={colors.accentBlueDark}
        >
          {displayHeight}cm
        </text>
        <text
          x={centerX + (displayWidth * scale) / 2 + 15}
          y={baseMortarCenterY}
          textAnchor="start"
          style={{ fontSize: 12 }}
          fill={colors.accentBlueDark}
          dominantBaseline="middle"
        >
          {baseHeight}cm
        </text>
      </svg>
    </div>
  );
};

export default KerbVisualization;
