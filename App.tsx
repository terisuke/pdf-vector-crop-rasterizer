
import React, { useState, useEffect, useCallback, useRef } from 'react';
import * as pdfjsLib from 'pdfjs-dist';
import type { PDFPageProxy } from 'pdfjs-dist';
import { ControlPanel } from './components/ControlPanel';
import { PdfViewer } from './components/PdfViewer';
import type {
  PdfPointCropArea,
  PDFDocumentProxy as PDFDocumentProxyType, // Renamed to avoid conflict
  GridDimensions,
  ZoneDefinition,
  StructuralElement,
  LayoutMetadata,
  ZoneType,
  StructuralElementType,
  StructuralElementMode,
  ElementSummary,
  AnnotationMetadata,
  Segment,
  GridPoint
} from './types';
import { Download, AlertCircle } from 'lucide-react';

const workerSrc = `https://esm.sh/pdfjs-dist@${pdfjsLib.version}/build/pdf.worker.mjs`;
pdfjsLib.GlobalWorkerOptions.workerSrc = workerSrc;

const floorOptions = ["1F", "2F"];

const calculateRealisticZones = (gridDimensions: GridDimensions, _floorPlan?: string): ZoneDefinition[] => {
  const totalGrids = gridDimensions.width_grids * gridDimensions.height_grids;
  if (totalGrids === 0) {
    return [
      { type: 'living', approximate_grids: 0, priority: 1 },
      { type: 'private', approximate_grids: 0, priority: 2 },
      { type: 'service', approximate_grids: 0, priority: 3 },
      { type: 'circulation', approximate_grids: 0, priority: 3 }
    ];
  }
  const usableGrids = Math.round(totalGrids * 0.75);

  let zones: ZoneDefinition[];
  if (totalGrids >= 120) {
    zones = [
      { type: 'living', approximate_grids: Math.round(usableGrids * 0.35), priority: 1 },
      { type: 'private', approximate_grids: Math.round(usableGrids * 0.35), priority: 2 },
      { type: 'service', approximate_grids: Math.round(usableGrids * 0.15), priority: 3 },
      { type: 'circulation', approximate_grids: Math.round(usableGrids * 0.15), priority: 3 }
    ];
  } else {
    zones = [
      { type: 'living', approximate_grids: Math.round(usableGrids * 0.40), priority: 1 },
      { type: 'private', approximate_grids: Math.round(usableGrids * 0.30), priority: 2 },
      { type: 'service', approximate_grids: Math.round(usableGrids * 0.15), priority: 3 },
      { type: 'circulation', approximate_grids: Math.round(usableGrids * 0.15), priority: 3 }
    ];
  }
  const currentSum = zones.reduce((acc, zone) => acc + zone.approximate_grids, 0);
  if (currentSum !== usableGrids && zones.length > 0 && usableGrids > 0) {
    const diff = usableGrids - currentSum;
    const targetZone = zones.find(z => z.priority === 1) || zones[0];
    targetZone.approximate_grids += diff;
    if(targetZone.approximate_grids < 0) targetZone.approximate_grids = 0;
  }
  return zones;
};

const roundGridCoordinate = (value: number): number => {
  return Math.round(value * 10) / 10;
};

// Convert canvas to grayscale for AI training optimization
const convertToGrayscale = (canvas: HTMLCanvasElement): HTMLCanvasElement => {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  
  // Use architectural drawing optimized weights
  // Emphasizes lines and structural elements
  for (let i = 0; i < data.length; i += 4) {
    // Modified weights for technical drawings (higher red channel for better line detection)
    const gray = data[i] * 0.4 + data[i + 1] * 0.4 + data[i + 2] * 0.2;
    data[i] = gray;     // R
    data[i + 1] = gray; // G
    data[i + 2] = gray; // B
    // Alpha channel (data[i + 3]) remains unchanged
  }
  
  ctx.putImageData(imageData, 0, 0);
  return canvas;
};


// Wall Merging Helper: isWallDuplicate
const isWallDuplicate = (wall1: StructuralElement, wall2: StructuralElement, tolerance: number): boolean => {
  if (!wall1.line_start || !wall1.line_end || !wall2.line_start || !wall2.line_end) return false;
  const sameDirection = (
    Math.abs(wall1.line_start.grid_x - wall2.line_start.grid_x) < tolerance &&
    Math.abs(wall1.line_start.grid_y - wall2.line_start.grid_y) < tolerance &&
    Math.abs(wall1.line_end.grid_x - wall2.line_end.grid_x) < tolerance &&
    Math.abs(wall1.line_end.grid_y - wall2.line_end.grid_y) < tolerance
  );

  const reverseDirection = (
    Math.abs(wall1.line_start.grid_x - wall2.line_end.grid_x) < tolerance &&
    Math.abs(wall1.line_start.grid_y - wall2.line_end.grid_y) < tolerance &&
    Math.abs(wall1.line_end.grid_x - wall2.line_start.grid_x) < tolerance &&
    Math.abs(wall1.line_end.grid_y - wall2.line_start.grid_y) < tolerance
  );

  return sameDirection || reverseDirection;
};

// Wall Merging Helper: cleanWallSegments
const cleanWallSegments = (walls: StructuralElement[]): StructuralElement[] => {
  // Filter out micro-segments (length < 0.05 grid units)
  const validWalls = walls.filter(wall => {
    if (!wall.line_start || !wall.line_end) return false;
    const dx = wall.line_end.grid_x - wall.line_start.grid_x;
    const dy = wall.line_end.grid_y - wall.line_start.grid_y;
    const length = Math.sqrt(dx * dx + dy * dy);
    return length > 0.05;
  });

  // Remove duplicates
  const uniqueWalls: StructuralElement[] = [];
  for (const wall of validWalls) {
    const isDuplicate = uniqueWalls.some(existing => {
      return isWallDuplicate(existing, wall, 0.1); // Using tolerance 0.1 as specified
    });
    if (!isDuplicate) {
      uniqueWalls.push(wall);
    }
  }
  return uniqueWalls;
};

// Wall Merging Helper: checkAdvancedCollinearity
const checkAdvancedCollinearity = (
  p1: {grid_x: number, grid_y: number},
  p2: {grid_x: number, grid_y: number},
  p3: {grid_x: number, grid_y: number},
  angleThreshold: number = Math.PI / 12 // Approx 15 degrees
): boolean => {
  const angle1 = Math.atan2(p2.grid_y - p1.grid_y, p2.grid_x - p1.grid_x);
  const angle2 = Math.atan2(p3.grid_y - p2.grid_y, p3.grid_x - p2.grid_x);

  let angleDiff = Math.abs(angle1 - angle2);
  if (angleDiff > Math.PI) angleDiff = 2 * Math.PI - angleDiff; // Normalize to (0, PI)

  return angleDiff < angleThreshold || Math.abs(angleDiff - Math.PI) < angleThreshold;
};

// Wall Merging Helper: canConnectWalls
const canConnectWalls = (
  wall1: StructuralElement,
  wall2: StructuralElement,
  angleThreshold: number = Math.PI / 12,
  distanceTolerance: number = 0.15 // Grid units
): boolean => {
  if (!wall1.line_start || !wall1.line_end || !wall2.line_start || !wall2.line_end) return false;

  const p1 = wall1.line_start;
  const p2 = wall1.line_end;
  const p3 = wall2.line_start;
  const p4 = wall2.line_end;

  const connected = (
    Math.abs(p2.grid_x - p3.grid_x) < distanceTolerance &&
    Math.abs(p2.grid_y - p3.grid_y) < distanceTolerance
  );

  if (!connected) return false;

  return checkAdvancedCollinearity(p1, p2, p4, angleThreshold);
};

// Wall Merging Helper: createContinuousWall
const createContinuousWall = (wallChain: StructuralElement[], mergedWallIndex: number): StructuralElement => {
  const firstSeg = wallChain[0];
  const lastSeg = wallChain[wallChain.length - 1];

  return {
    type: 'structural_wall',
    line_start: firstSeg.line_start,
    line_end: lastSeg.line_end,
    wall_thickness: firstSeg.wall_thickness || 0.15,
    name: `continuous_wall_${mergedWallIndex}`,
    grid_x: roundGridCoordinate(Math.min(firstSeg.line_start!.grid_x, lastSeg.line_end!.grid_x)),
    grid_y: roundGridCoordinate(Math.min(firstSeg.line_start!.grid_y, lastSeg.line_end!.grid_y)),
    grid_width: roundGridCoordinate(Math.abs(lastSeg.line_end!.grid_x - firstSeg.line_start!.grid_x)),
    grid_height: roundGridCoordinate(Math.abs(lastSeg.line_end!.grid_y - firstSeg.line_start!.grid_y)),
  };
};

// Wall Merging Helper: buildContinuousWalls
const buildContinuousWalls = (cleanedWalls: StructuralElement[]): StructuralElement[] => {
  const mergedWalls: StructuralElement[] = [];
  const processed = new Set<number>();

  for (let i = 0; i < cleanedWalls.length; i++) {
    if (processed.has(i)) continue;

    let wallChain = [cleanedWalls[i]];
    processed.add(i);

    let currentLastWall = cleanedWalls[i];
    let extendedInChain = true;

    while(extendedInChain) {
        extendedInChain = false;
        for (let j = 0; j < cleanedWalls.length; j++) {
            if (processed.has(j)) continue;
            const nextWall = cleanedWalls[j];
            if (canConnectWalls(currentLastWall, nextWall)) {
                wallChain.push(nextWall);
                processed.add(j);
                currentLastWall = nextWall;
                extendedInChain = true;
                break;
            }
        }
    }
    if (wallChain.length > 0) {
      mergedWalls.push(createContinuousWall(wallChain, mergedWalls.length + 1));
    }
  }
  return mergedWalls;
};


// Validation Helper: findDuplicateWallsInList (kept for potential use with old data, but not primary validation)
const findDuplicateWallsInList = (walls: StructuralElement[]): number => {
  let duplicateCount = 0;
  const wallTolerance = 0.1;
  for (let i = 0; i < walls.length; i++) {
    for (let j = i + 1; j < walls.length; j++) {
      if (isWallDuplicate(walls[i], walls[j], wallTolerance)) {
        duplicateCount++;
      }
    }
  }
  return duplicateCount;
};

const App: React.FC = () => {
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [pdfDoc, setPdfDoc] = useState<PDFDocumentProxyType | null>(null);
  const [currentPageNum, setCurrentPageNum] = useState<number>(1);
  const [totalPages, setTotalPages] = useState<number>(0);
  const [cropArea, setCropArea] = useState<PdfPointCropArea | null>(null);
  const [dpi, setDpi] = useState<number>(300);
  const [drawingScaleDenominator, setDrawingScaleDenominator] = useState<number>(100);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [statusMessage, setStatusMessage] = useState<string>('Please select a PDF file to begin.');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string>('plan_default_id_1f.png');

  const [viewZoomLevel, setViewZoomLevel] = useState<number>(1.0);
  const MIN_ZOOM = 0.25;
  const MAX_ZOOM = 5.0;
  const ZOOM_STEP = 0.25;

  const [currentFloorLevel, setCurrentFloorLevel] = useState<string>(floorOptions[0]);

  const initialGridDimensions: GridDimensions = { width_grids: 12, height_grids: 10 };
  const [gridDimensions, setGridDimensions] = useState<GridDimensions>(initialGridDimensions);
  const [majorZones, setMajorZones] = useState<ZoneDefinition[]>(calculateRealisticZones(initialGridDimensions));
  const [structuralElements, setStructuralElements] = useState<StructuralElement[]>([]);
  const [showGridOverlay, setShowGridOverlay] = useState<boolean>(true);

  const [structuralElementMode, setStructuralElementMode] = useState<StructuralElementMode>('none');
  const [pendingElementType, setPendingElementType] = useState<StructuralElementType>('stair');
  // const [wallDrawingMode, setWallDrawingMode] = useState<'freehand' | 'grid_snap'>('grid_snap'); // Wall drawing mode deprecated
  
  const [exportFormat, setExportFormat] = useState<'grayscale' | 'color'>('grayscale'); // Default to grayscale for AI training


  const sanitizeForFilename = (name: string): string => {
    if (!name) return 'unknown_document';
    const baseName = name.endsWith('.pdf') ? name.slice(0, -4) : name;
    return baseName
      .toLowerCase()
      .replace(/\s+/g, '_')
      .replace(/[^a-z0-9_]/g, '')
      .replace(/_+/g, '_')
      .replace(/^_|_$/g, '');
  };

  const generateStandardFilename = useCallback((basePdfName: string | undefined, floor: string, extensionNoDot: string) => {
    const sanitizedId = sanitizeForFilename(basePdfName || 'document');
    const floorLower = floor.toLowerCase();
    return `plan_${sanitizedId}_${floorLower}.${extensionNoDot}`;
  }, []);


  const extractFloorFromFilename = (name: string): string | null => {
    const match = name.match(/_([GMLU]?\d*F)\.pdf$/i);
    if (match && match[1]) {
      return match[1].toUpperCase();
    }
    return null;
  };

  const calculateGridDimensionsFromCrop = useCallback((
    cropAreaPdf: PdfPointCropArea,
    scaleDenominatorValue: number
  ): GridDimensions => {
    const MM_PER_PDF_POINT = 0.352778;
    const GRID_CELL_SIZE_MM = 910;

    const realWidthMm = cropAreaPdf.width * MM_PER_PDF_POINT * scaleDenominatorValue;
    const realHeightMm = cropAreaPdf.height * MM_PER_PDF_POINT * scaleDenominatorValue;

    const widthGrids = Math.max(1, Math.round(realWidthMm / GRID_CELL_SIZE_MM));
    const heightGrids = Math.max(1, Math.round(realHeightMm / GRID_CELL_SIZE_MM));

    console.log(`Auto Grid: Crop ${cropAreaPdf.width.toFixed(1)}x${cropAreaPdf.height.toFixed(1)}pts @ 1:${scaleDenominatorValue} -> ${realWidthMm.toFixed(0)}x${realHeightMm.toFixed(0)}mm -> ${widthGrids}x${heightGrids} grids`);

    return { width_grids: widthGrids, height_grids: heightGrids };
  }, []);

  const suggestInitialCrop = useCallback(async (page: PDFPageProxy, currentScaleDenominator: number) => {
    const viewport = page.getViewport({ scale: 1 });
    const width = viewport.width;
    const height = viewport.height;

    const margin = 0.05;
    const suggestedCrop: PdfPointCropArea = {
      x: width * margin,
      y: height * margin,
      width: width * (1 - 2 * margin),
      height: height * (1 - 2 * margin)
    };

    setCropArea(suggestedCrop);
    const autoGridDims = calculateGridDimensionsFromCrop(suggestedCrop, currentScaleDenominator);
    setGridDimensions(autoGridDims);
    setMajorZones(calculateRealisticZones(autoGridDims));
    setStatusMessage(`PDF loaded. Suggested crop applied. Auto grid: ${autoGridDims.width_grids}×${autoGridDims.height_grids}.`);
  }, [calculateGridDimensionsFromCrop]);


  useEffect(() => {
    if (!pdfFile) {
      setPdfDoc(null); setTotalPages(0); setCurrentPageNum(1); setCropArea(null);
      setStatusMessage('Please select a PDF file to begin.');
      setFileName(generateStandardFilename('default_id', floorOptions[0], 'png'));
      setViewZoomLevel(1.0); setCurrentFloorLevel(floorOptions[0]);
      setDrawingScaleDenominator(100);
      const defaultGridDims = { width_grids: 12, height_grids: 10 };
      setGridDimensions(defaultGridDims);
      setMajorZones(calculateRealisticZones(defaultGridDims));
      setStructuralElements([]); setStructuralElementMode('none');
      // setWallDrawingMode('grid_snap'); // Wall drawing mode deprecated
      return;
    }

    const loadPdf = async () => {
      setStatusMessage(`Loading ${pdfFile.name}...`); setError(null); setViewZoomLevel(1.0);
      try {
        const arrayBuffer = await pdfFile.arrayBuffer();
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer });
        const pdf = await loadingTask.promise;
        setPdfDoc(pdf); setTotalPages(pdf.numPages); setCurrentPageNum(1);

        const parsedFloor = extractFloorFromFilename(pdfFile.name);
        let activeFloor = floorOptions[0];
        if (parsedFloor && floorOptions.includes(parsedFloor)) {
          activeFloor = parsedFloor; setCurrentFloorLevel(parsedFloor);
        } else { setCurrentFloorLevel(floorOptions[0]); }

        setFileName(generateStandardFilename(pdfFile.name, activeFloor, 'png'));

        const firstPage = await pdf.getPage(1);
        await suggestInitialCrop(firstPage, drawingScaleDenominator);

      } catch (err) {
        console.error('Failed to load PDF:', err);
        let message = 'An unknown error occurred.';
        if (err instanceof Error) message = err.message;
        else if (typeof err === 'string') message = err;

        if (message.includes('Worker')) {
            setError(`Failed to load PDF: PDF worker issue. ${message}. Ensure browser supports modern JS and can fetch from esm.sh.`);
        } else { setError(`Failed to load PDF: ${message}. Ensure it's a valid PDF.`); }
        setStatusMessage('Error loading PDF.'); setPdfDoc(null); setCurrentFloorLevel(floorOptions[0]);
      }
    };
    loadPdf();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pdfFile, generateStandardFilename, suggestInitialCrop, drawingScaleDenominator]);

  useEffect(() => {
    if (pdfFile) {
       setFileName(generateStandardFilename(pdfFile.name, currentFloorLevel, 'png'));
    }
  }, [pdfFile, currentFloorLevel, generateStandardFilename]);


  const handleFileChange = (file: File | null) => {
    setPdfFile(file);
  };

  const handlePageChange = async (newPageNum: number) => {
    if (pdfDoc && newPageNum > 0 && newPageNum <= totalPages) {
      setCurrentPageNum(newPageNum);
      setViewZoomLevel(1.0);
      const page = await pdfDoc.getPage(newPageNum);
      await suggestInitialCrop(page, drawingScaleDenominator);
    }
  };

  const handleCropChange = useCallback((newCropArea: PdfPointCropArea | null) => {
    setCropArea(newCropArea);
    if (newCropArea && newCropArea.width > 0 && newCropArea.height > 0) {
      const autoGridDims = calculateGridDimensionsFromCrop(newCropArea, drawingScaleDenominator);
      setGridDimensions(autoGridDims);
      setMajorZones(calculateRealisticZones(autoGridDims));
      setStatusMessage(`Crop selected. Auto grid: ${autoGridDims.width_grids}×${autoGridDims.height_grids}. Floor: ${currentFloorLevel}.`);
    } else {
      const defaultGridDims = initialGridDimensions;
      setGridDimensions(defaultGridDims);
      setMajorZones(calculateRealisticZones(defaultGridDims));
      if (pdfDoc) {
        setStatusMessage(`Crop cleared. Grid reset to default: ${defaultGridDims.width_grids}×${defaultGridDims.height_grids}.`);
      }
    }
  }, [calculateGridDimensionsFromCrop, drawingScaleDenominator, currentFloorLevel, pdfDoc, initialGridDimensions]);


  const handleDpiChange = (newDpi: number) => {
    const validDpi = Math.max(72, newDpi);
    setDpi(validDpi);
    if (pdfDoc) {
      setStatusMessage(`DPI: ${validDpi}. Scale: 1:${drawingScaleDenominator}. Grid: ${gridDimensions.width_grids}x${gridDimensions.height_grids}.`);
    }
  };

  const handleDrawingScaleChange = useCallback((newScale: number) => {
    const validScale = Math.max(1, newScale);
    setDrawingScaleDenominator(validScale);

    if (cropArea && cropArea.width > 0 && cropArea.height > 0) {
      const autoGridDims = calculateGridDimensionsFromCrop(cropArea, validScale);
      setGridDimensions(autoGridDims);
      setMajorZones(calculateRealisticZones(autoGridDims));
      setStatusMessage(`Scale 1:${validScale} updated. Grid recalculated: ${autoGridDims.width_grids}×${autoGridDims.height_grids}.`);
    } else if (pdfDoc) {
      setStatusMessage(`Scale: 1:${validScale}. Grid: ${gridDimensions.width_grids}x${gridDimensions.height_grids}. (No active crop for auto-recalc)`);
    }
  }, [cropArea, calculateGridDimensionsFromCrop, pdfDoc, gridDimensions.width_grids, gridDimensions.height_grids]);


  const handleFloorChange = (newFloor: string) => {
    if (floorOptions.includes(newFloor)) {
      setCurrentFloorLevel(newFloor);
      if (pdfDoc && pdfFile) {
         setFileName(generateStandardFilename(pdfFile.name, newFloor, 'png'));
         setStatusMessage(`Floor: ${newFloor}. Scale: 1:${drawingScaleDenominator}. Grid: ${gridDimensions.width_grids}x${gridDimensions.height_grids}.`);
      }
    }
  };

  const handleZoomIn = () => setViewZoomLevel(prev => Math.min(MAX_ZOOM, parseFloat((prev + ZOOM_STEP).toFixed(2))));
  const handleZoomOut = () => setViewZoomLevel(prev => Math.max(MIN_ZOOM, parseFloat((prev - ZOOM_STEP).toFixed(2))));
  const handleZoomReset = () => setViewZoomLevel(1.0);

  const handleGridDimensionsChange = (dimensions: GridDimensions) => {
    const newWidth = Math.max(1, Math.min(dimensions.width_grids, 50));
    const newHeight = Math.max(1, Math.min(dimensions.height_grids, 50));
    const newGridDimensions = { width_grids: newWidth, height_grids: newHeight };
    setGridDimensions(newGridDimensions);
    setMajorZones(calculateRealisticZones(newGridDimensions));
    if (pdfDoc) {
      setStatusMessage(`Grid manually set to: ${newWidth}x${newHeight}. Scale: 1:${drawingScaleDenominator}.`);
    }
  };

  const addCommonStructuralElements = (currentGridDims: GridDimensions) => {
    const commonElements: StructuralElement[] = [
      { type: 'stair', grid_x: roundGridCoordinate(Math.min(6, currentGridDims.width_grids - 2)), grid_y: roundGridCoordinate(Math.min(8, currentGridDims.height_grids - 2)), grid_width: roundGridCoordinate(2), grid_height: roundGridCoordinate(2), name: 'main_stairs' },
      { type: 'entrance', grid_x: roundGridCoordinate(Math.min(2, currentGridDims.width_grids - 1)), grid_y: roundGridCoordinate(Math.min(9, currentGridDims.height_grids - 1)), grid_width: roundGridCoordinate(1), grid_height: roundGridCoordinate(1), name: 'front_entrance' }
    ];
    
    setStructuralElements(commonElements.filter(el =>
        el.grid_x >= 0 && el.grid_y >= 0 &&
        (el.grid_width || 0) > 0 && (el.grid_height || 0) > 0 &&
        (el.grid_x + (el.grid_width || 0)) <= currentGridDims.width_grids + 0.001 &&
        (el.grid_y + (el.grid_height || 0)) <= currentGridDims.height_grids + 0.001
    ));
  };

  const handleQuickZoneSetup = () => {
    const newGridDimensions: GridDimensions = { width_grids: 14, height_grids: 10 };
    setGridDimensions(newGridDimensions);
    setMajorZones(calculateRealisticZones(newGridDimensions));
    addCommonStructuralElements(newGridDimensions);

    if (pdfDoc) {
      setStatusMessage(`Quick setup for single-family house applied. Grid: ${newGridDimensions.width_grids}x${newGridDimensions.height_grids}. Zones & elements updated.`);
    }
  };

  const handleToggleGridOverlay = () => setShowGridOverlay(prev => !prev);

  // This function is kept for potential use if single-click placement is re-enabled for non-wall elements.
  // Currently, drag-to-place is primary via onStructuralElementPlace.
  const handleAddStructuralElement = (gridX: number, gridY: number) => {
    if (structuralElementMode === 'place' && pendingElementType !== 'structural_wall' && gridDimensions.width_grids > 0 && gridDimensions.height_grids > 0) {
      const newElement: StructuralElement = {
        type: pendingElementType,
        grid_x: roundGridCoordinate(Math.max(0, Math.min(gridX, gridDimensions.width_grids - (pendingElementType === 'stair' ? 2 : 1)))),
        grid_y: roundGridCoordinate(Math.max(0, Math.min(gridY, gridDimensions.height_grids - (pendingElementType === 'stair' ? 2 : 1)))),
        name: `${pendingElementType}_${structuralElements.length + 1}`
      };

      if (pendingElementType === 'stair') {
          newElement.grid_width = roundGridCoordinate(2); newElement.grid_height = roundGridCoordinate(2);
      } else { // entrance, balcony
          newElement.grid_width = roundGridCoordinate(1); newElement.grid_height = roundGridCoordinate(1);
      }

      if (newElement.grid_x + (newElement.grid_width || 0) <= gridDimensions.width_grids + 0.001 &&
          newElement.grid_y + (newElement.grid_height || 0) <= gridDimensions.height_grids + 0.001) {
        setStructuralElements(prev => [...prev, newElement]);
      } else { setStatusMessage(`Cannot place ${pendingElementType}: not enough space on grid.`); }
      setStructuralElementMode('none'); // Deactivate after one placement
    }
  };

  const handleStructuralElementPlace = (gridX: number, gridY: number, width: number, height: number) => {
    if (structuralElementMode === 'place' && pendingElementType !== 'structural_wall' && gridDimensions.width_grids > 0 && gridDimensions.height_grids > 0) {
        const clampedGridX = Math.max(0, Math.min(gridX, gridDimensions.width_grids - width));
        const clampedGridY = Math.max(0, Math.min(gridY, gridDimensions.height_grids - height));
        const clampedWidth = Math.max(0.1, Math.min(width, gridDimensions.width_grids - clampedGridX));
        const clampedHeight = Math.max(0.1, Math.min(height, gridDimensions.height_grids - clampedGridY));

        const newElement: StructuralElement = {
            type: pendingElementType,
            grid_x: roundGridCoordinate(clampedGridX), grid_y: roundGridCoordinate(clampedGridY),
            grid_width: roundGridCoordinate(clampedWidth), grid_height: roundGridCoordinate(clampedHeight),
            name: `${pendingElementType}_${structuralElements.length + 1}`
        };

        if (newElement.grid_x >= 0 && newElement.grid_y >= 0 &&
            (newElement.grid_width || 0) > 0 && (newElement.grid_height || 0) > 0 &&
            (newElement.grid_x + (newElement.grid_width || 0)) <= gridDimensions.width_grids + 0.001 &&
            (newElement.grid_y + (newElement.grid_height || 0)) <= gridDimensions.height_grids + 0.001) {
            setStructuralElements(prev => [...prev, newElement]);
        } else { setStatusMessage(`Cannot place ${pendingElementType}: invalid dimensions or position.`); }
        setStructuralElementMode('none'); // Deactivate after one placement
    }
  };

 // Wall chain placement is kept for potential future use or handling old data, but primary wall drawing is disabled.
 const handleWallChainPlacement = (segments: Array<Segment<GridPoint>>) => {
    if (segments.length === 0) {
        setStatusMessage('Wall drawing cancelled or no valid segments.');
        setStructuralElementMode('none');
        return;
    }
    
    const WALL_THICKNESS_GRID_UNITS = 0.15;
    const newWalls: StructuralElement[] = [];
    const currentWallElementsCount = structuralElements.filter(el => el.type === 'structural_wall').length;

    segments.forEach((segment, index) => {
        const newWall: StructuralElement = {
            type: 'structural_wall',
            line_start: {
                grid_x: roundGridCoordinate(segment.start.grid_x),
                grid_y: roundGridCoordinate(segment.start.grid_y)
            },
            line_end: {
                grid_x: roundGridCoordinate(segment.end.grid_x),
                grid_y: roundGridCoordinate(segment.end.grid_y)
            },
            wall_thickness: WALL_THICKNESS_GRID_UNITS,
            grid_x: roundGridCoordinate(Math.min(segment.start.grid_x, segment.end.grid_x)),
            grid_y: roundGridCoordinate(Math.min(segment.start.grid_y, segment.end.grid_y)),
            grid_width: roundGridCoordinate(Math.abs(segment.end.grid_x - segment.start.grid_x)),
            grid_height: roundGridCoordinate(Math.abs(segment.end.grid_y - segment.start.grid_y)),
            name: `wall_segment_${currentWallElementsCount + index + 1}`
        };
        newWalls.push(newWall);
    });

    setStructuralElements(prev => {
        const elementsWithNewWalls = [...prev, ...newWalls];
        const mergedElements = mergeConnectedWallLines(elementsWithNewWalls);
        const finalWallCount = mergedElements.filter(el => el.type === 'structural_wall').length;
        setStatusMessage(`Added ${newWalls.length} wall segments. Total walls: ${finalWallCount}.`);
        return mergedElements;
    });

    setStructuralElementMode('none');
};

  const handleDeleteStructuralElement = (index: number) => {
    setStructuralElements(prev => {
        const updatedElements = prev.filter((_, i) => i !== index);
        // If there were walls and some are deleted, merging might still be relevant for remaining walls from old data
        const wallsExist = updatedElements.some(el => el.type === 'structural_wall');
        if (wallsExist) {
            const mergedAfterDelete = mergeConnectedWallLines(updatedElements);
             const wallCount = mergedAfterDelete.filter(el => el.type === 'structural_wall').length;
             setStatusMessage(`Element removed. Total non-wall: ${mergedAfterDelete.filter(el => el.type !== 'structural_wall').length}. Walls (if any): ${wallCount}.`);
            return mergedAfterDelete;
        }
        setStatusMessage(`Element removed. Total non-wall elements: ${updatedElements.length}.`);
        return updatedElements;
    });
  };


  const handleToggleStructuralMode = (type: StructuralElementType) => {
    if (type === 'structural_wall') {
      setStatusMessage('Wall drawing temporarily disabled. Focus on Stairs, Entry, and Balcony elements.');
      setStructuralElementMode('none'); // Ensure mode is off if wall is selected
      return; 
    }
    
    if (structuralElementMode === 'place' && pendingElementType === type) {
      setStructuralElementMode('none');
      setStatusMessage('Placement mode deactivated.');
    } else {
      setPendingElementType(type);
      setStructuralElementMode('place');
      setStatusMessage(`Ready to place ${type}. Click or drag on canvas. (Shortcut: ${type === 'stair' ? '1' : type === 'entrance' ? '2' : '3'})`);
    }
  };

  const downloadDataUrl = (dataUrl: string, filenameToUse: string) => {
    const link = document.createElement('a');
    link.href = dataUrl; link.download = filenameToUse;
    document.body.appendChild(link); link.click(); document.body.removeChild(link);
    if (dataUrl.startsWith('blob:')) URL.revokeObjectURL(dataUrl);
  };

  const mergeConnectedWallLines = (elements: StructuralElement[]): StructuralElement[] => {
    const wallElements = elements.filter(el => el.type === 'structural_wall' && el.line_start && el.line_end);
    const otherElements = elements.filter(el => el.type !== 'structural_wall' || !el.line_start || !el.line_end);

    if (wallElements.length <= 1) {
      return [...otherElements, ...wallElements];
    }
    // console.log(`Wall merge start: ${wallElements.length} segments`);
    const cleanedWalls = cleanWallSegments(wallElements);
    // console.log(`After cleaning: ${cleanedWalls.length} segments`);
    const mergedContinuousWalls = buildContinuousWalls(cleanedWalls);
    // console.log(`After merging: ${mergedContinuousWalls.length} continuous walls`);
    return [...otherElements, ...mergedContinuousWalls];
  };

  const validateStructuralElements = (elementsToValidate: StructuralElement[], floor: string): { valid: boolean; message: string } => {
    const nonWallElements = elementsToValidate.filter(el => el.type !== 'structural_wall');
    
    if (floor === "1F") {
      if (!nonWallElements.some(el => el.type === 'entrance')) {
        return { valid: false, message: "1F requires at least one entrance element." };
      }
      if (!nonWallElements.some(el => el.type === 'stair')) {
        return { valid: false, message: "1F requires at least one stair element." };
      }
    } else {
      if (nonWallElements.some(el => el.type === 'entrance')) {
        return { valid: false, message: `${floor} should not have entrance. Entrances are for 1F.` };
      }
      if (!nonWallElements.some(el => el.type === 'stair')) {
        return { valid: false, message: `${floor} requires at least one stair element.` };
      }
    }
  
    const elementCounts = {
      stairs: nonWallElements.filter(el => el.type === 'stair').length,
      entries: nonWallElements.filter(el => el.type === 'entrance').length,
      balconies: nonWallElements.filter(el => el.type === 'balcony').length
    };
  
    return { 
      valid: true, 
      message: `✅ Annotated: ${elementCounts.stairs} stair(s), ${elementCounts.entries} entrance(s), ${elementCounts.balconies} balcony(s).`
    };
  };
  

  const handleProcessAndSave = useCallback(async () => {
    if (!pdfDoc || !pdfFile) { setError("No PDF document loaded."); return; }
    if (!currentFloorLevel || !floorOptions.includes(currentFloorLevel)) { setError('Invalid floor. Choose 1F or 2F.'); setIsProcessing(false); return; }
    if (drawingScaleDenominator <= 0) { setError('Drawing scale denominator must be > 0.'); setIsProcessing(false); return; }
    if (gridDimensions.width_grids <= 0 || gridDimensions.height_grids <= 0) { setError('Grid dimensions must be > 0.'); setIsProcessing(false); return; }

    setIsProcessing(true); setError(null);

    // Merging is still useful if old data has walls or if wall drawing is re-enabled later.
    const mergedElements = mergeConnectedWallLines(structuralElements);
    const nonWallElementsForOutput = mergedElements.filter(el => el.type !== 'structural_wall');

    const validationResult = validateStructuralElements(nonWallElementsForOutput, currentFloorLevel);
    if (!validationResult.valid) {
        setError(`Validation failed: ${validationResult.message}`);
        setStatusMessage(`Validation Error: ${validationResult.message}`);
        setIsProcessing(false);
        return;
    }

    const currentOutputPngFilename = generateStandardFilename(pdfFile.name, currentFloorLevel, 'png');
    setStatusMessage(`Processing page ${currentPageNum} (Floor: ${currentFloorLevel}) at ${dpi} DPI, Scale 1:${drawingScaleDenominator}...`);

    try {
      const page = await pdfDoc.getPage(currentPageNum);
      let effectiveCropPdfPoints: PdfPointCropArea;
      const originalViewport = page.getViewport({ scale: 1 });

      if (cropArea && cropArea.width > 0 && cropArea.height > 0) { effectiveCropPdfPoints = cropArea; }
      else { effectiveCropPdfPoints = { x: 0, y: 0, width: originalViewport.width, height: originalViewport.height };
        setStatusMessage(`No crop selected. Processing full page ${currentPageNum} (Floor: ${currentFloorLevel})...`);
      }

      const highDpiScale = dpi / 72.0;
      const highDpiPageCanvas = document.createElement('canvas');
      const highDpiPageCtx = highDpiPageCanvas.getContext('2d');
      if (!highDpiPageCtx) throw new Error("Could not get canvas context for full page rendering.");

      const highDpiViewport = page.getViewport({ scale: highDpiScale });
      highDpiPageCanvas.width = Math.max(1, Math.round(highDpiViewport.width));
      highDpiPageCanvas.height = Math.max(1, Math.round(highDpiViewport.height));
      await page.render({ canvasContext: highDpiPageCtx, viewport: highDpiViewport }).promise;

      const srcX = Math.round(effectiveCropPdfPoints.x * highDpiScale);
      const srcY = Math.round(effectiveCropPdfPoints.y * highDpiScale);
      const srcWidth = Math.round(effectiveCropPdfPoints.width * highDpiScale);
      const srcHeight = Math.round(effectiveCropPdfPoints.height * highDpiScale);

      const finalCroppedCanvas = document.createElement('canvas');
      finalCroppedCanvas.width = Math.max(1, srcWidth); finalCroppedCanvas.height = Math.max(1, srcHeight);
      const finalCroppedCtx = finalCroppedCanvas.getContext('2d');
      if (!finalCroppedCtx) throw new Error("Could not get context for final cropped image.");

      if (srcWidth > 0 && srcHeight > 0) finalCroppedCtx.drawImage(highDpiPageCanvas, srcX, srcY, srcWidth, srcHeight, 0, 0, srcWidth, srcHeight);
      else { finalCroppedCanvas.width = 1; finalCroppedCanvas.height = 1; finalCroppedCtx.clearRect(0,0,1,1); }

      // Apply grayscale conversion if selected
      if (exportFormat === 'grayscale') {
        convertToGrayscale(finalCroppedCanvas);
      }

      const pngDataUrl = finalCroppedCanvas.toDataURL('image/png');
      downloadDataUrl(pngDataUrl, currentOutputPngFilename);

      const REAL_WORLD_MODULE_MM = 910; const MM_PER_INCH = 25.4;
      const gridPxUnrounded = (REAL_WORLD_MODULE_MM / MM_PER_INCH) * (dpi / drawingScaleDenominator);
      const gridPx = parseFloat(gridPxUnrounded.toFixed(1));
      
      const elementSummary: ElementSummary = {
        total_elements: nonWallElementsForOutput.length,
        stair_count: nonWallElementsForOutput.filter(el => el.type === 'stair').length,
        entrance_count: nonWallElementsForOutput.filter(el => el.type === 'entrance').length,
        balcony_count: nonWallElementsForOutput.filter(el => el.type === 'balcony').length,
      };

      const annotationMetadata: AnnotationMetadata = {
        annotator_version: "v2.0_structural_focus",
        annotation_time: new Date().toISOString(),
        floor_type: currentFloorLevel,
        grid_resolution: `${gridDimensions.width_grids}x${gridDimensions.height_grids}`,
        drawing_scale: `1:${drawingScaleDenominator}`
      };

      const layoutMetadata: LayoutMetadata = {
        grid_px: gridPx, grid_mm: REAL_WORLD_MODULE_MM, floor: currentFloorLevel,
        layout_bounds: gridDimensions, major_zones: majorZones,
        structural_elements: nonWallElementsForOutput, // Only non-wall elements
        total_approximate_area: majorZones.reduce((sum, zone) => sum + zone.approximate_grids, 0),
        element_summary: elementSummary,
        annotation_metadata: annotationMetadata,
        export_settings: {
          format: exportFormat,
          optimized_for: 'diffusion_training',
          color_space: exportFormat === 'grayscale' ? 'grayscale_8bit' : 'rgb_24bit'
        }
      };

      const jsonString = JSON.stringify(layoutMetadata, null, 2);
      const jsonBlob = new Blob([jsonString], { type: 'application/json' });
      const jsonFileName = generateStandardFilename(pdfFile.name, currentFloorLevel, 'json');
      const jsonUrl = URL.createObjectURL(jsonBlob);
      downloadDataUrl(jsonUrl, jsonFileName);
      setStatusMessage(`Saved ${currentOutputPngFilename} and ${jsonFileName}. ${validationResult.message}`);
    } catch (err) {
      console.error('Failed to process PDF:', err);
      const message = err instanceof Error ? err.message : String(err);
      setError(`Processing failed: ${message}`); setStatusMessage('Error during processing.');
    } finally { setIsProcessing(false); }
  }, [pdfDoc, pdfFile, currentPageNum, cropArea, dpi, drawingScaleDenominator, currentFloorLevel, generateStandardFilename, gridDimensions, majorZones, structuralElements, mergeConnectedWallLines, validateStructuralElements]);

  const handleGlobalKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) {
        // Ignore combinations with modifier keys for simple shortcuts
        // Shift might be used by user for text input elsewhere, but for 1,2,3 it's not typical.
        return;
    }
    
    // Allow keyboard shortcuts only if a PDF is loaded
    if (!pdfDoc) return;

    // Prevent interference if an input field is focused
    const activeElement = document.activeElement;
    if (activeElement && (activeElement.tagName === 'INPUT' || activeElement.tagName === 'TEXTAREA' || activeElement.tagName === 'SELECT')) {
        return;
    }

    switch (event.key) {
      case '1':
        handleToggleStructuralMode('stair');
        event.preventDefault();
        break;
      case '2':
        handleToggleStructuralMode('entrance');
        event.preventDefault();
        break;
      case '3':
        handleToggleStructuralMode('balcony');
        event.preventDefault();
        break;
      case 'Escape':
        if (structuralElementMode !== 'none') {
          setStructuralElementMode('none');
          setStatusMessage('Placement mode deactivated.');
          event.preventDefault(); 
        }
        // PdfViewer's own Escape handler will manage its internal states like crop drawing.
        break;
      default:
        break;
    }
  }, [pdfDoc, structuralElementMode, handleToggleStructuralMode]); // Added handleToggleStructuralMode to dependencies

  useEffect(() => {
    document.addEventListener('keydown', handleGlobalKeyDown);
    return () => {
      document.removeEventListener('keydown', handleGlobalKeyDown);
    };
  }, [handleGlobalKeyDown]);


  return (
    <div className="min-h-screen flex flex-col bg-gray-900 text-gray-100">
      <header className="bg-gray-800 p-4 shadow-md">
        <h1 className="text-3xl font-bold text-center text-sky-400">PDF Vector Crop & Rasterizer</h1>
      </header>

      <ControlPanel
        onFileChange={handleFileChange}
        onPrevPage={() => handlePageChange(currentPageNum - 1)}
        onNextPage={() => handlePageChange(currentPageNum + 1)}
        currentPage={currentPageNum} totalPages={totalPages}
        isPrevDisabled={currentPageNum <= 1 || !pdfDoc}
        isNextDisabled={currentPageNum >= totalPages || !pdfDoc || totalPages === 0}
        dpi={dpi} onDpiChange={handleDpiChange}
        drawingScaleDenominator={drawingScaleDenominator} onDrawingScaleChange={handleDrawingScaleChange}
        onProcess={handleProcessAndSave} isProcessing={isProcessing} pdfLoaded={!!pdfDoc}
        floorOptions={floorOptions} currentFloor={currentFloorLevel} onFloorChange={handleFloorChange}
        viewZoomLevel={viewZoomLevel} onZoomIn={handleZoomIn} onZoomOut={handleZoomOut} onZoomReset={handleZoomReset}
        isZoomInDisabled={!pdfDoc || viewZoomLevel >= MAX_ZOOM}
        isZoomOutDisabled={!pdfDoc || viewZoomLevel <= MIN_ZOOM}
        gridDimensions={gridDimensions} onGridDimensionsChange={handleGridDimensionsChange}
        onQuickZoneSetup={handleQuickZoneSetup} showGridOverlay={showGridOverlay} onToggleGridOverlay={handleToggleGridOverlay}
        majorZones={majorZones} onMajorZonesChange={setMajorZones}
        structuralElements={structuralElements} onStructuralElementsChange={setStructuralElements} // Kept for completeness
        structuralElementMode={structuralElementMode} pendingElementType={pendingElementType}
        onToggleStructuralMode={handleToggleStructuralMode} onDeleteStructuralElement={handleDeleteStructuralElement}
        setStatusMessage={setStatusMessage}
        exportFormat={exportFormat} onExportFormatChange={setExportFormat}
        // wallDrawingMode and onWallDrawingModeChange are removed
      />

      {error && (
        <div className="bg-red-500 text-white p-3 m-4 rounded-md flex items-center" role="alert">
          <AlertCircle size={20} className="mr-2" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto text-sm font-semibold hover:bg-red-600 p-1 rounded">Dismiss</button>
        </div>
      )}

      <main className="flex-grow p-4 overflow-hidden flex items-center justify-center">
        {pdfDoc ? (
          <PdfViewer
            pdfDoc={pdfDoc} pageNum={currentPageNum} onCropChange={handleCropChange}
            currentCropInPdfPoints={cropArea} viewZoomLevel={viewZoomLevel}
            showGridOverlay={showGridOverlay} gridDimensions={gridDimensions}
            structuralElements={structuralElements} structuralElementMode={structuralElementMode}
            pendingElementType={pendingElementType}
            // wallDrawingMode prop removed
            onGridCellClick={handleAddStructuralElement} // Kept for potential single-click, though drag-place is primary
            onStructuralElementPlace={handleStructuralElementPlace}
            onWallChainPlacement={handleWallChainPlacement} // Kept for potential future use, but not actively called for walls
            setStructuralElementMode={setStructuralElementMode} // For PdfViewer to cancel its own operations AND the mode
          />
        ) : (
          <div className="flex flex-col items-center justify-center h-full text-gray-400">
            <Download size={64} className="mb-4"/>
            <p className="text-xl">{statusMessage}</p>
          </div>
        )}
      </main>

      <footer className="bg-gray-800 p-3 text-center text-sm text-gray-400">
        <p>{statusMessage}</p>
      </footer>
    </div>
  );
};

export default App;
