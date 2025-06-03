
import React, { useRef, useEffect, useState, useCallback } from 'react';
import type {
    PDFDocumentProxy,
    PdfPointCropArea,
    CanvasPixelCropArea,
    GridDimensions,
    StructuralElement,
    StructuralElementMode,
    StructuralElementType,
    WallDrawingState, // Kept for type structure, but wall drawing state itself is not actively used
    CanvasPoint, 
    GridPoint,   
    Segment      
} from '../types';
import type { PDFPageProxy, RenderTask } from 'pdfjs-dist';

// Type guards (can be simplified if wall drawing state is fully removed)
function isGridPoint(point: any): point is GridPoint {
  return point !== null && typeof point === 'object' &&
         typeof point.grid_x === 'number' && typeof point.grid_y === 'number';
}

function isCanvasPoint(point: any): point is CanvasPoint {
  return point !== null && typeof point === 'object' &&
         typeof point.x === 'number' && typeof point.y === 'number';
}


interface PdfViewerProps {
  pdfDoc: PDFDocumentProxy;
  pageNum: number;
  onCropChange: (areaInPdfPoints: PdfPointCropArea | null) => void;
  currentCropInPdfPoints: PdfPointCropArea | null;
  viewZoomLevel: number;
  showGridOverlay: boolean;
  gridDimensions: GridDimensions;
  structuralElements: StructuralElement[];
  structuralElementMode: StructuralElementMode;
  pendingElementType: StructuralElementType;
  // wallDrawingMode?: 'freehand' | 'grid_snap'; // Deprecated
  onGridCellClick: (gridX: number, gridY: number) => void; 
  onStructuralElementPlace: (gridX: number, gridY: number, width: number, height: number) => void; 
  onWallChainPlacement: (segments: Array<Segment<GridPoint>>) => void; // Kept for structural completeness, but wall drawing is disabled
  setStructuralElementMode: (mode: StructuralElementMode) => void; 
}

interface GridLayoutInfo {
  cellSize: number; 
  cellWidth: number;
  cellHeight: number;
  offsetX: number;
  offsetY: number;
  actualGridWidth: number;
  actualGridHeight: number;
}

export const PdfViewer: React.FC<PdfViewerProps> = ({
  pdfDoc,
  pageNum,
  onCropChange,
  currentCropInPdfPoints,
  viewZoomLevel,
  showGridOverlay,
  gridDimensions,
  structuralElements,
  structuralElementMode,
  pendingElementType,
  // wallDrawingMode, // Deprecated
  onGridCellClick, 
  onStructuralElementPlace,
  onWallChainPlacement, // Kept, but unlikely to be called if walls are disabled
  setStructuralElementMode,
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [isDrawingCrop, setIsDrawingCrop] = useState(false);
  const [cropStartPoint, setCropStartPoint] = useState<CanvasPoint | null>(null);
  const [currentCropRectCanvasPx, setCurrentCropRectCanvasPx] = useState<CanvasPixelCropArea | null>(null);

  const [structuralElementDrag, setStructuralElementDrag] = useState<{
    isDrawing: boolean;
    startPoint: CanvasPoint | null;
    currentRect: CanvasPixelCropArea | null;
  }>({ isDrawing: false, startPoint: null, currentRect: null });

  // WallDrawingState is largely unused now as wall drawing is disabled. Kept for type integrity if some parts remain.
  const [wallDrawingState, setWallDrawingState] = useState<WallDrawingState>({
    mode: 'none', segments: [], currentStart: null, currentEnd: null, lastClickTime: 0
  });

  const [pageRenderInfo, setPageRenderInfo] = useState<{ scale: number; page: PDFPageProxy | null; canvasWidth: number; canvasHeight: number }>({
    scale: 1, page: null, canvasWidth: 0, canvasHeight: 0,
  });

  const renderTaskRef = useRef<RenderTask | null>(null);

  const calculateGridLayout = useCallback((canvasWidth: number, canvasHeight: number, currentGridDimensions: GridDimensions): GridLayoutInfo | null => {
    if (!currentGridDimensions || currentGridDimensions.width_grids <= 0 || currentGridDimensions.height_grids <= 0 || canvasWidth <= 0 || canvasHeight <= 0) {
      return null;
    }
    const targetGridWidthCount = currentGridDimensions.width_grids;
    const targetGridHeightCount = currentGridDimensions.height_grids;

    const cellWidth = canvasWidth / targetGridWidthCount;
    const cellHeight = canvasHeight / targetGridHeightCount;

    const cellSize = Math.min(cellWidth, cellHeight);

    return {
        cellSize: cellSize,
        cellWidth: cellWidth,
        cellHeight: cellHeight,
        offsetX: 0,
        offsetY: 0,
        actualGridWidth: canvasWidth,
        actualGridHeight: canvasHeight
    };
  }, []);

  const convertCanvasPointToGridCoords = useCallback((
    point: CanvasPoint,
    canvasWidth: number, canvasHeight: number,
    currentGridDimensions: GridDimensions
  ): GridPoint | null => {
    const layout = calculateGridLayout(canvasWidth, canvasHeight, currentGridDimensions);
    if (!layout || !point) return null;
    const { cellWidth, cellHeight, offsetX, offsetY } = layout;

    if (cellWidth === 0 || cellHeight === 0) return null;

    let gridX = (point.x - offsetX) / cellWidth;
    let gridY = (point.y - offsetY) / cellHeight;

    gridX = Math.max(0, Math.min(gridX, currentGridDimensions.width_grids));
    gridY = Math.max(0, Math.min(gridY, currentGridDimensions.height_grids));

    return { grid_x: gridX, grid_y: gridY };
  }, [calculateGridLayout]);

  // Snap to grid not actively used for walls if wall drawing is off. Kept for other potential uses.
  const snapToGridIntersection = useCallback((
    point: CanvasPoint, 
    canvasWidth: number, 
    canvasHeight: number,
    currentGridDimensions: GridDimensions
  ): GridPoint | null => { 
    const layout = calculateGridLayout(canvasWidth, canvasHeight, currentGridDimensions);
    if (!layout || !point) return null;
    
    const { cellWidth, cellHeight, offsetX, offsetY } = layout;
    if (cellWidth === 0 || cellHeight === 0) return null;

    const gridX = Math.round((point.x - offsetX) / cellWidth);
    const gridY = Math.round((point.y - offsetY) / cellHeight);

    const clampedX = Math.max(0, Math.min(gridX, currentGridDimensions.width_grids));
    const clampedY = Math.max(0, Math.min(gridY, currentGridDimensions.height_grids));

    return { grid_x: clampedX, grid_y: clampedY };
  }, [calculateGridLayout]);


  const drawGridOverlay = useCallback((ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, currentGridDims: GridDimensions) => {
    const layout = calculateGridLayout(canvasW, canvasH, currentGridDims);
    if (!layout) return;
    const { cellWidth, cellHeight, offsetX, offsetY } = layout;

    ctx.save();
    ctx.strokeStyle = 'rgba(100, 100, 100, 0.5)'; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
    for (let i = 0; i <= currentGridDims.width_grids; i++) {
      const x = offsetX + (i * cellWidth);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, canvasH);
      ctx.stroke();
    }
    for (let i = 0; i <= currentGridDims.height_grids; i++) {
      const y = offsetY + (i * cellHeight);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(canvasW, y);
      ctx.stroke();
    }
    ctx.restore();
  }, [calculateGridLayout]);

  const drawStructuralElements = useCallback((ctx: CanvasRenderingContext2D, canvasW: number, canvasH: number, elements: StructuralElement[], currentGridDims: GridDimensions) => {
    const layout = calculateGridLayout(canvasW, canvasH, currentGridDims);
    if (!layout || !elements || elements.length === 0) return;
    const { cellWidth, cellHeight, offsetX, offsetY } = layout;

    ctx.save();
    elements.forEach((element) => {
      if (element.type === 'structural_wall' && element.line_start && element.line_end) { // Walls are not actively drawn but might exist in old data
        const startX = offsetX + element.line_start.grid_x * cellWidth;
        const startY = offsetY + element.line_start.grid_y * cellHeight;
        const endX = offsetX + element.line_end.grid_x * cellWidth;
        const endY = offsetY + element.line_end.grid_y * cellHeight;
        const avgCellSize = (cellWidth + cellHeight) / 2;
        const thickness = (element.wall_thickness || 0.15) * avgCellSize;

        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.strokeStyle = 'rgba(139, 69, 19, 0.8)'; // Brown for walls
        ctx.lineWidth = Math.max(1, thickness);
        ctx.stroke();
      } else if (element.grid_width && element.grid_height && element.type !== 'structural_wall') { // Focus on non-wall elements
        const x = offsetX + (element.grid_x * cellWidth);
        const y = offsetY + (element.grid_y * cellHeight);
        const width = element.grid_width * cellWidth;
        const height = element.grid_height * cellHeight;

        let color = 'rgba(255, 0, 255, 0.7)'; let textColor = 'white';
        switch (element.type) {
          case 'stair': color = 'rgba(255, 165, 0, 0.7)'; break; // Orange
          case 'entrance': color = 'rgba(0, 200, 0, 0.7)'; break; // Green
          case 'balcony': color = 'rgba(0, 191, 255, 0.7)'; break; // Deep sky blue
        }
        ctx.fillStyle = color; ctx.fillRect(x, y, width, height);
        ctx.strokeStyle = 'rgba(0,0,0,0.8)';
        const avgCellSizeForStroke = (cellWidth + cellHeight) / 2;
        ctx.lineWidth = Math.min(3, Math.max(1, avgCellSizeForStroke * 0.05));
        ctx.strokeRect(x, y, width, height);

        if (width > 20 && height > 15) {
          ctx.fillStyle = textColor; ctx.font = `bold ${Math.max(8, Math.min(12, Math.min(width,height)/4))}px Arial`;
          ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
          const label = (element.name || element.type).substring(0, Math.floor(width/8)).toUpperCase();
          ctx.fillText(label, x + width / 2, y + height / 2);
        }
      }
    });
    ctx.restore();
  }, [calculateGridLayout]);

  const performRender = useCallback(async (
    pageToRender: PDFPageProxy, scaleToUse: number, canvasElement: HTMLCanvasElement, context: CanvasRenderingContext2D,
    committedCropCanvasRect: CanvasPixelCropArea | null,
    liveRectToDraw: CanvasPixelCropArea | null,
    liveRectType: StructuralElementType | 'crop' | null
    // currentWallDrawingState removed from params as wall drawing is inactive
  ) => {
    if (renderTaskRef.current) renderTaskRef.current.cancel();

    const viewport = pageToRender.getViewport({ scale: scaleToUse });
    const newCanvasWidth = Math.max(1, Math.round(viewport.width));
    const newCanvasHeight = Math.max(1, Math.round(viewport.height));

    if (canvasElement.width !== newCanvasWidth || canvasElement.height !== newCanvasHeight) {
      canvasElement.width = newCanvasWidth; canvasElement.height = newCanvasHeight;
    }
    setPageRenderInfo(prev => ({...prev, canvasWidth: newCanvasWidth, canvasHeight: newCanvasHeight}));
    context.clearRect(0, 0, newCanvasWidth, newCanvasHeight);

    const task = pageToRender.render({ canvasContext: context, viewport });
    renderTaskRef.current = task;

    try {
      await task.promise;
      if (committedCropCanvasRect && committedCropCanvasRect.width > 0 && committedCropCanvasRect.height > 0) {
        context.save(); context.strokeStyle = 'rgba(255, 0, 0, 0.8)'; context.lineWidth = 2;
        context.fillStyle = 'rgba(255, 0, 0, 0.1)';
        context.fillRect(committedCropCanvasRect.x, committedCropCanvasRect.y, committedCropCanvasRect.width, committedCropCanvasRect.height);
        context.strokeRect(committedCropCanvasRect.x, committedCropCanvasRect.y, committedCropCanvasRect.width, committedCropCanvasRect.height);
        context.restore();
      }
      if (showGridOverlay) drawGridOverlay(context, newCanvasWidth, newCanvasHeight, gridDimensions);
      drawStructuralElements(context, newCanvasWidth, newCanvasHeight, structuralElements, gridDimensions);

      if (liveRectToDraw && liveRectToDraw.width > 0 && liveRectToDraw.height > 0) {
        context.save();
        if (liveRectType === 'crop') {
          context.strokeStyle = 'rgba(255, 0, 0, 0.7)'; context.lineWidth = 1; context.setLineDash([3, 3]);
        } else if (liveRectType !== 'structural_wall') { // Only draw for non-wall elements
          context.strokeStyle = 'rgba(0, 255, 255, 0.7)'; context.lineWidth = 2; context.setLineDash([4, 4]);
        }
        if (liveRectType !== 'structural_wall') { // Only draw for non-wall elements
             context.strokeRect(liveRectToDraw.x, liveRectToDraw.y, liveRectToDraw.width, liveRectToDraw.height);
        }
        context.restore();
      }

      // Wall drawing visual feedback is removed as it's disabled
      // if (currentWallDrawingState && currentWallDrawingState.mode === 'drawing' && liveRectType === 'structural_wall') { ... }

    } catch (error: any) {
      if (error.name !== 'RenderingCancelledException') console.error('Error during performRender:', error);
    } finally {
      if (renderTaskRef.current === task) renderTaskRef.current = null;
    }
  }, [showGridOverlay, gridDimensions, structuralElements, drawGridOverlay, drawStructuralElements, calculateGridLayout]);


  const renderPage = useCallback(async () => {
    if (!pdfDoc || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const context = canvas.getContext('2d');
    if (!context) return;

    try {
      const page = await pdfDoc.getPage(pageNum);
      setPageRenderInfo(prev => ({ ...prev, scale: viewZoomLevel, page }));

      let committedCropCanvasRect: CanvasPixelCropArea | null = null;
      if (currentCropInPdfPoints && viewZoomLevel > 0) {
        committedCropCanvasRect = {
          x: currentCropInPdfPoints.x * viewZoomLevel, y: currentCropInPdfPoints.y * viewZoomLevel,
          width: currentCropInPdfPoints.width * viewZoomLevel, height: currentCropInPdfPoints.height * viewZoomLevel,
        };
      }

      let liveRect: CanvasPixelCropArea | null = null;
      let liveType: StructuralElementType | 'crop' | null = null;

      if (isDrawingCrop && currentCropRectCanvasPx) {
        liveRect = currentCropRectCanvasPx;
        liveType = 'crop';
      } else if (structuralElementMode === 'place' && pendingElementType !== 'structural_wall' && structuralElementDrag.isDrawing && structuralElementDrag.currentRect) {
        liveRect = structuralElementDrag.currentRect;
        liveType = pendingElementType;
      } 
      // No live drawing for 'structural_wall' as it's disabled
      // else if (structuralElementMode === 'place' && pendingElementType === 'structural_wall' && wallDrawingState.mode === 'drawing') {
      //   liveType = 'structural_wall';
      // }

      await performRender(page, viewZoomLevel, canvas, context, committedCropCanvasRect, liveRect, liveType);

    } catch (error) { console.error('Error in renderPage:', error); }
  }, [pdfDoc, pageNum, currentCropInPdfPoints, performRender, viewZoomLevel, isDrawingCrop, currentCropRectCanvasPx, structuralElementMode, pendingElementType, structuralElementDrag]);

  useEffect(() => { renderPage(); }, [renderPage]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const resizeObserver = new ResizeObserver(() => renderPage());
    resizeObserver.observe(container);
    return () => {
      resizeObserver.unobserve(container);
      if (renderTaskRef.current) { renderTaskRef.current.cancel(); renderTaskRef.current = null; }
    };
  }, [renderPage]);

  // finishWallChain is kept for structural completeness but not actively called for walls
  const finishWallChain = useCallback(() => {
    // Wall drawing is disabled, so this function is unlikely to be meaningfully called
    // Kept to avoid breaking if onWallChainPlacement is used by other means (though not planned)
    console.warn("finishWallChain called, but wall drawing is disabled.");
    onWallChainPlacement([]); // Call with empty array if somehow triggered
    
    setTimeout(() => {
       setWallDrawingState({ mode: 'none', segments: [], currentStart: null, currentEnd: null, lastClickTime: 0 });
    }, 50);
  }, [onWallChainPlacement]);


  const handleMouseDown = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas || !pageRenderInfo.page) return;
    const rect = canvas.getBoundingClientRect();
    const x = event.clientX - rect.left;
    const y = event.clientY - rect.top;
    // const { canvasWidth, canvasHeight } = pageRenderInfo; 
    // const currentTime = Date.now();

    if (structuralElementMode === 'place') {
      if (pendingElementType === 'structural_wall') {
        // Wall drawing is disabled, so this path should not be hit.
        // If it is, do nothing and reset states.
        setStructuralElementDrag({ isDrawing: false, startPoint: null, currentRect: null });
        setIsDrawingCrop(false);
        setWallDrawingState({ mode: 'none', segments: [], currentStart: null, currentEnd: null, lastClickTime: 0 });
        return;
      } else { 
        // For non-wall elements (Stair, Entry, Balcony)
        setStructuralElementDrag({ isDrawing: true, startPoint: { x, y }, currentRect: { x, y, width: 0, height: 0 } });
        setWallDrawingState({ mode: 'none', segments: [], currentStart: null, currentEnd: null, lastClickTime: 0 }); // Reset wall state
        setIsDrawingCrop(false); // Ensure crop is not active
        return; 
      }
    }

    // Default to crop drawing if not in element placement mode
    setIsDrawingCrop(true);
    setCropStartPoint({ x, y });
    setCurrentCropRectCanvasPx({ x, y, width: 0, height: 0 });
    onCropChange(null); 
    setStructuralElementDrag({ isDrawing: false, startPoint: null, currentRect: null }); // Reset element drag state
    setWallDrawingState({ mode: 'none', segments: [], currentStart: null, currentEnd: null, lastClickTime: 0 }); // Reset wall state
  };


  const handleMouseMove = (event: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current || !pageRenderInfo.page) return; 
    const canvas = canvasRef.current; const rect = canvas.getBoundingClientRect();
    const currentX = event.clientX - rect.left; const currentY = event.clientY - rect.top;
    // const { canvasWidth, canvasHeight } = pageRenderInfo;

    // Wall drawing mouse move logic is disabled
    // if (structuralElementMode === 'place' && pendingElementType === 'structural_wall' && wallDrawingState.mode === 'drawing') { ... }
    
    if (structuralElementMode === 'place' && pendingElementType !== 'structural_wall' && structuralElementDrag.isDrawing && structuralElementDrag.startPoint) {
      const newRect = {
        x: Math.min(structuralElementDrag.startPoint.x, currentX), y: Math.min(structuralElementDrag.startPoint.y, currentY),
        width: Math.abs(currentX - structuralElementDrag.startPoint.x), height: Math.abs(currentY - structuralElementDrag.startPoint.y),
      };
      setStructuralElementDrag(prev => ({ ...prev, currentRect: newRect }));
    } else if (isDrawingCrop && cropStartPoint) {
      const newRect = {
        x: Math.min(cropStartPoint.x, currentX), y: Math.min(cropStartPoint.y, currentY),
        width: Math.abs(currentX - cropStartPoint.x), height: Math.abs(currentY - cropStartPoint.y),
      };
      setCurrentCropRectCanvasPx(newRect);
    }
  };

  const handleMouseUp = () => {
    const { canvasWidth, canvasHeight, page, scale } = pageRenderInfo;

    if (structuralElementMode === 'place' && pendingElementType !== 'structural_wall' && structuralElementDrag.isDrawing && structuralElementDrag.currentRect) {
      const gridLayout = calculateGridLayout(canvasWidth, canvasHeight, gridDimensions);
      if (gridLayout && structuralElementDrag.currentRect.width > 5 && structuralElementDrag.currentRect.height > 5) { 
        const { cellWidth, cellHeight, offsetX, offsetY } = gridLayout;
        const rect = structuralElementDrag.currentRect;

        const exactGridX = (rect.x - offsetX) / cellWidth;
        const exactGridY = (rect.y - offsetY) / cellHeight;
        const exactGridWidth = rect.width / cellWidth;
        const exactGridHeight = rect.height / cellHeight;

        if (exactGridWidth > 0 && exactGridHeight > 0) {
          onStructuralElementPlace(exactGridX, exactGridY, exactGridWidth, exactGridHeight);
        }
      }
      // setStructuralElementMode('none'); // App.tsx handles mode deactivation via global Escape or element placement.
      setStructuralElementDrag({ isDrawing: false, startPoint: null, currentRect: null });
      return; 
    }

    if (isDrawingCrop) {
      setIsDrawingCrop(false);
      if (currentCropRectCanvasPx && currentCropRectCanvasPx.width > 0 && currentCropRectCanvasPx.height > 0 && scale > 0 && page) {
        const pdfX = currentCropRectCanvasPx.x / scale;
        const pdfY = currentCropRectCanvasPx.y / scale;
        const pdfWidth = currentCropRectCanvasPx.width / scale;
        const pdfHeight = currentCropRectCanvasPx.height / scale;

        const originalViewport = page.getViewport({ scale: 1 });
        const clampedX = Math.max(0, Math.min(pdfX, originalViewport.width));
        const clampedY = Math.max(0, Math.min(pdfY, originalViewport.height));
        const clampedWidth = Math.max(0, Math.min(pdfWidth, originalViewport.width - clampedX));
        const clampedHeight = Math.max(0, Math.min(pdfHeight, originalViewport.height - clampedY));

        if (clampedWidth > 0 && clampedHeight > 0) {
          onCropChange({ x: clampedX, y: clampedY, width: clampedWidth, height: clampedHeight });
        } else { onCropChange(null); }
      } else { onCropChange(null); }
      setCropStartPoint(null); 
      return;
    }
  };

  const handleMouseLeave = () => {
    if (isDrawingCrop) handleMouseUp(); 
    if (structuralElementMode === 'place' && pendingElementType !== 'structural_wall' && structuralElementDrag.isDrawing) {
      handleMouseUp(); 
    }
  };

  // Keyboard handling for Enter (wall finish) is removed.
  // Escape for specific PdfViewer drawing states (crop, element drag) is kept.
  // Global Escape for structuralElementMode is handled by App.tsx.
  const localHandleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Escape') {
      let handled = false;
      if (isDrawingCrop) {
        setIsDrawingCrop(false); 
        setCropStartPoint(null); 
        setCurrentCropRectCanvasPx(null); 
        onCropChange(currentCropInPdfPoints); // Restore previous crop if cancelling
        handled = true;
      }
      if (structuralElementDrag.isDrawing) {
        setStructuralElementDrag({ isDrawing: false, startPoint: null, currentRect: null });
        // No need to call setStructuralElementMode('none') here, App.tsx handles it.
        handled = true;
      }
      if (handled) {
        event.preventDefault(); // Prevent App.tsx's Escape if PdfViewer handled it for its internal state.
        event.stopPropagation(); // Further ensure App.tsx doesn't also process this Escape.
      }
    }
  }, [isDrawingCrop, structuralElementDrag.isDrawing, onCropChange, currentCropInPdfPoints]);

  useEffect(() => {
    const canvasElem = canvasRef.current;
    if (canvasElem) { // Ensure canvas is available before adding/removing listener
        // Add listener to the canvas itself to ensure it has focus for these specific Escapes
        canvasElem.addEventListener('keydown', localHandleKeyDown);
        return () => canvasElem.removeEventListener('keydown', localHandleKeyDown);
    }
  }, [localHandleKeyDown]);

  let cursorStyle = 'crosshair'; // Default for crop
  if (structuralElementMode === 'place' && pendingElementType !== 'structural_wall') {
    cursorStyle = 'copy'; // For placing non-wall elements
  }
  // No specific cursor for wall, as it's disabled.

  return (
    <div ref={containerRef} className="w-full h-full flex items-center justify-center bg-gray-700 rounded-lg shadow-inner overflow-auto canvas-container" style={{minHeight: '300px'}}>
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        className="rounded-md shadow-xl"
        style={{ maxWidth: '100%', maxHeight: '100%', cursor: cursorStyle }}
        aria-label="PDF page display for cropping with optional grid and structural element overlays"
        role="img"
        tabIndex={0} // Make canvas focusable for its own keydown events
      />
    </div>
  );
};
