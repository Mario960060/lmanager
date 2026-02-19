// Carrier speeds in meters per hour
export const carrierSpeeds = [
  { size: 0.1, speed: 1500 },
  { size: 0.125, speed: 1500 },
  { size: 0.15, speed: 1500 },
  { size: 0.3, speed: 2500 },
  { size: 0.5, speed: 1000 },
  { size: 1, speed: 4000 },
  { size: 3, speed: 6000 },
  { size: 5, speed: 7000 },
  { size: 10, speed: 8000 }
];

// Material capacity in units per carrier size (in tonnes)
// Format: { [materialName]: { [carrierSize]: quantity } }
export const materialCapacity = {
  // Monoblocks (kostka) - pieces
  monoblocks: {
    0.1: 33,
    0.125: 41,
    0.15: 50,
    0.3: 100,
    0.5: 166,
    1: 333,
    3: 666,
    5: 1000,
    10: 1000
  },
  
  // Bricks (cegła) - same as monoblocks (pieces)
  bricks: {
    0.1: 33,
    0.125: 41,
    0.15: 50,
    0.3: 100,
    0.5: 166,
    1: 333,
    3: 666,
    5: 1000,
    10: 1000
  },

  // Blocks (bloczki) - pieces
  blocks: {
    0.1: 6,
    0.125: 8,
    0.15: 10,
    0.3: 20,
    0.5: 33,
    1: 66,
    3: 133,
    5: 200,
    10: 200
  },

  // Slabs (płyty) - pieces
  slabs: {
    0.1: 2,
    0.125: 2.5,
    0.15: 3,
    0.3: 6,
    0.5: 10,
    1: 20,
    3: 40,
    5: 60,
    10: 60
  },

  // Small kerbs (kerby małe) - pieces
  kerbsSmall: {
    0.1: 20,
    0.125: 25,
    0.15: 30,
    0.3: 60,
    0.5: 100,
    1: 200,
    3: 400,
    5: 600,
    10: 600
  },

  // Large kerbs (kerby duże) - pieces
  kerbsLarge: {
    0.1: 4,
    0.125: 5,
    0.15: 6,
    0.3: 12,
    0.5: 20,
    1: 40,
    3: 80,
    5: 120,
    10: 120
  },

  // Sets - pieces
  sets: {
    0.1: 50,
    0.125: 62,
    0.15: 75,
    0.3: 150,
    0.5: 250,
    1: 500,
    3: 1000,
    5: 1500,
    10: 1500
  },

  // Cement - bags/worki
  cement: {
    0.1: 4,      // Taczka 100kg
    0.125: 5,    // Taczka 125kg
    0.15: 6,     // Taczka 150kg
    0.3: 12,     // Wózek 300kg
    0.5: 20,     // Wózek 500kg
    1: 40,       // Wózek 1t (min)
    3: 80,       // Wózek 3t (avg)
    5: 120,      // Wózek 5t
    10: 120      // Wózek 10t
  },

  // Sand (piasek) - tonnes
  sand: {
    0.1: 0.1,
    0.125: 0.125,
    0.15: 0.15,
    0.3: 0.3,
    0.5: 0.5,
    1: 1,
    3: 3,
    5: 5,
    10: 10
  },

  // Type 1 Aggregate (Type 1) - tonnes
  type1: {
    0.1: 0.1,
    0.125: 0.125,
    0.15: 0.15,
    0.3: 0.3,
    0.5: 0.5,
    1: 1,
    3: 3,
    5: 5,
    10: 10
  },

  // Type 1 Aggregate (tape1 alias) - tonnes
  tape1: {
    0.1: 0.1,
    0.125: 0.125,
    0.15: 0.15,
    0.3: 0.3,
    0.5: 0.5,
    1: 1,
    3: 3,
    5: 5,
    10: 10
  },

  // Grit Sand - tonnes
  gritSand: {
    0.1: 0.1,
    0.125: 0.125,
    0.15: 0.15,
    0.3: 0.3,
    0.5: 0.5,
    1: 1,
    3: 3,
    5: 5,
    10: 10
  },

  // Soil (grunty) - tonnes
  soil: {
    0.1: 0.1,
    0.125: 0.125,
    0.15: 0.15,
    0.3: 0.3,
    0.5: 0.5,
    1: 1,
    3: 3,
    5: 5,
    10: 10
  }
};

// Helper function to get carrier speed by size
export const findCarrierSpeed = (sizeInTonnes: number): number => {
  const carrier = carrierSpeeds.find(c => c.size === sizeInTonnes);
  return carrier ? carrier.speed : 4000; // Default to 4000 m/h if not found
};

// Helper function to get material capacity by name and carrier size
export const getMaterialCapacity = (materialName: string, carrierSizeInTonnes: number): number => {
  const material = materialCapacity[materialName as keyof typeof materialCapacity];
  if (!material) {
    console.warn(`Material ${materialName} not found in capacity data`);
    return 1; // Default fallback
  }
  
  const capacity = material[carrierSizeInTonnes as keyof typeof material];
  if (capacity === undefined) {
    console.warn(`Carrier size ${carrierSizeInTonnes}t not found for material ${materialName}`);
    // Try to find closest size
    const sizes = Object.keys(material).map(Number).sort((a, b) => a - b);
    const closestSize = sizes.reduce((prev, curr) =>
      Math.abs(curr - carrierSizeInTonnes) < Math.abs(prev - carrierSizeInTonnes) ? curr : prev
    );
    return material[closestSize as keyof typeof material] || 1;
  }
  
  return capacity;
};
