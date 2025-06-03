
import React from 'react';
import {
  UploadCloud, ArrowLeftCircle, ArrowRightCircle, Settings2, Download,
  ZoomIn, ZoomOut, RotateCcw, Building, CaseSensitive,
  Grid3x3, Home, Eye, EyeOff, AlertTriangle,
  Layers, MapPin, Trash2, GalleryVerticalEnd, PanelTopOpen // PanelTopOpen was for Wall, can be kept or removed if not used by Balcony etc.
} from 'lucide-react';
import type { GridDimensions, ZoneDefinition, StructuralElement, StructuralElementType, StructuralElementMode } from '../types';
// import { logger } from '../utils/logger'; // Removed for production

interface ControlPanelProps {
  onFileChange: (file: File | null) => void;
  onPrevPage: () => void;
  onNextPage: () => void;
  currentPage: number;
  totalPages: number;
  isPrevDisabled: boolean;
  isNextDisabled: boolean;
  dpi: number;
  onDpiChange: (dpi: number) => void;
  drawingScaleDenominator: number;
  onDrawingScaleChange: (scale: number) => void;
  onProcess: () => void;
  isProcessing: boolean;
  pdfLoaded: boolean;
  floorOptions: string[];
  currentFloor: string;
  onFloorChange: (floor: string) => void;
  viewZoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  isZoomInDisabled: boolean;
  isZoomOutDisabled: boolean;
  gridDimensions: GridDimensions;
  onGridDimensionsChange: (dimensions: GridDimensions) => void;
  onQuickZoneSetup: () => void;
  showGridOverlay: boolean;
  onToggleGridOverlay: () => void;
  majorZones: ZoneDefinition[];
  onMajorZonesChange: (zones: ZoneDefinition[]) => void; // Kept for completeness
  structuralElements: StructuralElement[];
  onStructuralElementsChange: (elements: StructuralElement[]) => void; // Kept for completeness
  structuralElementMode: StructuralElementMode;
  pendingElementType: StructuralElementType;
  onToggleStructuralMode: (type: StructuralElementType) => void;
  onDeleteStructuralElement: (index: number) => void;
  setStatusMessage: (message: string) => void;
  exportFormat: 'grayscale' | 'color';
  onExportFormatChange: (format: 'grayscale' | 'color') => void;
  hasPhase1Metadata: boolean;
  onDownloadPhase1Json: () => void;
  onLoadSession: () => void;
  // wallDrawingMode?: 'freehand' | 'grid_snap'; // Deprecated
  // onWallDrawingModeChange?: (mode: 'freehand' | 'grid_snap') => void; // Deprecated
}

const iconSize = 20;
const buttonBaseClass = "flex items-center justify-center px-3 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-offset-gray-800 disabled:opacity-50 disabled:cursor-not-allowed transition-colors duration-150";
const primaryButtonClass = `${buttonBaseClass} text-white bg-sky-600 hover:bg-sky-700 focus:ring-sky-500`;
const secondaryButtonClass = `${buttonBaseClass} text-gray-300 bg-gray-700 hover:bg-gray-600 focus:ring-sky-500`;
const iconButtonClass = `${secondaryButtonClass} px-2`;
const selectClass = "bg-gray-700 text-white p-1.5 border border-gray-600 rounded-md focus:ring-sky-500 focus:border-sky-500 text-sm h-[38px]";
const inputBaseClass = `${selectClass} w-20`;

const ZoneValidationWarning: React.FC<{ totalZoneGrids: number; availableGrids: number }> = ({ totalZoneGrids, availableGrids }) => {
  if (availableGrids === 0 && totalZoneGrids > 0) {
    return (
      <div className="text-yellow-400 text-xs flex items-center mt-1">
        <AlertTriangle size={14} className="mr-1 flex-shrink-0" />
        Zones defined for an empty grid (0 available grids).
      </div>
    );
  }
  if (availableGrids === 0) return null;
  const utilizationRate = totalZoneGrids / availableGrids;
  if (utilizationRate < 0.6 || utilizationRate > 0.9) {
    return (
      <div className="text-yellow-400 text-xs flex items-center mt-1" role="alert" aria-live="polite">
        <AlertTriangle size={14} className="mr-1 flex-shrink-0" />
        Zone total ({totalZoneGrids}) may be unrealistic for {availableGrids} grid layout
        (Rate: {Math.round(utilizationRate * 100)}%)
      </div>
    );
  }
  return null;
};


export const ControlPanel: React.FC<ControlPanelProps> = ({
  onFileChange, onPrevPage, onNextPage, currentPage, totalPages, isPrevDisabled, isNextDisabled,
  dpi, onDpiChange, drawingScaleDenominator, onDrawingScaleChange, onProcess, isProcessing, pdfLoaded,
  floorOptions, currentFloor, onFloorChange, viewZoomLevel, onZoomIn, onZoomOut, onZoomReset,
  isZoomInDisabled, isZoomOutDisabled, gridDimensions, onGridDimensionsChange, onQuickZoneSetup,
  showGridOverlay, onToggleGridOverlay, majorZones, structuralElements, structuralElementMode,
  pendingElementType, onToggleStructuralMode, onDeleteStructuralElement, setStatusMessage,
  exportFormat, onExportFormatChange, hasPhase1Metadata, onDownloadPhase1Json, onLoadSession,
  // wallDrawingMode, onWallDrawingModeChange // Deprecated
}) => {
  // Removed repetitive render logging to reduce log noise
  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files && event.target.files[0]) onFileChange(event.target.files[0]);
    else onFileChange(null);
    event.target.value = '';
  };

  const totalZoneGrids = majorZones.reduce((sum, zone) => sum + zone.approximate_grids, 0);
  const availableGrids = gridDimensions.width_grids * gridDimensions.height_grids;

  const structuralElementTypes: { type: StructuralElementType, label: string, icon: React.ElementType, shortcut: string }[] = [
    { type: 'stair', label: 'Stair', icon: Layers, shortcut: '1' },
    { type: 'entrance', label: 'Entry', icon: MapPin, shortcut: '2' },
    { type: 'balcony', label: 'Balcony', icon: GalleryVerticalEnd, shortcut: '3' },
    // { type: 'structural_wall', label: 'Wall', icon: PanelTopOpen, shortcut: 'W' }, // Wall drawing disabled
  ];

  const gridInputClass = `${inputBaseClass} w-16 text-green-300`;

  // Counts for display (walls will typically be 0 for new annotations)
  const wallCount = structuralElements.filter(el => el.type === 'structural_wall').length;
  const stairCount = structuralElements.filter(el => el.type === 'stair').length;
  const entranceCount = structuralElements.filter(el => el.type === 'entrance').length;
  const balconyCount = structuralElements.filter(el => el.type === 'balcony').length;

  let wallCountColor = 'text-gray-400'; // Walls are de-emphasized
  if (wallCount > 0) wallCountColor = 'text-yellow-500'; // Indicate if old data has walls

  const nonWallElementsCount = stairCount + entranceCount + balconyCount;


  return (
    <div className="bg-gray-800 p-3 shadow-lg sticky top-0 z-10 border-b border-gray-700">
      <div className="max-w-full mx-auto flex flex-wrap items-center justify-between gap-3 px-2">

        <div className="flex items-center space-x-2 flex-shrink-0">
          <label htmlFor="pdf-upload" className={`${secondaryButtonClass} cursor-pointer whitespace-nowrap`}>
            <UploadCloud size={iconSize} className="mr-2" /> {pdfLoaded ? "Change PDF" : "Open PDF"}
          </label>
          <input id="pdf-upload" type="file" accept=".pdf" onChange={handleFileSelect} className="hidden" aria-label="PDF file input" />
          <button 
            onClick={onLoadSession} 
            className={`${secondaryButtonClass} whitespace-nowrap`}
            title="Load saved session"
          >
            <Layers size={iconSize} className="mr-2" />
            Load Session
          </button>
          {pdfLoaded && (
             <div className="flex items-center space-x-1.5">
              <Building size={iconSize-2} className="text-sky-400 ml-1" />
              <label htmlFor="floor-select" className="sr-only">Floor Level</label>
              <select id="floor-select" value={currentFloor} onChange={(e) => onFloorChange(e.target.value)} disabled={!pdfLoaded} className={selectClass} title="Select Floor Level">
                {floorOptions.map(floor => (<option key={floor} value={floor}>{floor}</option>))}
              </select>
            </div>
          )}
        </div>

        {pdfLoaded && (
          <div className="flex flex-col items-start">
            <div className="flex items-center space-x-2 flex-wrap gap-2 md:gap-3">
              <div className="flex items-center space-x-1.5" title="Grid cells (auto-calculated from crop, manual fine-tuning available)">
                <Grid3x3 size={iconSize-2} className="text-green-400" />
                <input id="grid-width-input" type="number" min="1" max="50" value={gridDimensions.width_grids} onChange={(e) => onGridDimensionsChange({...gridDimensions, width_grids: parseInt(e.target.value,10)||1})} className={gridInputClass} title="Grid width (auto-calculated, adjustable)"/>
                <span className="text-gray-400">×</span>
                <input id="grid-height-input" type="number" min="1" max="50" value={gridDimensions.height_grids} onChange={(e) => onGridDimensionsChange({...gridDimensions, height_grids: parseInt(e.target.value,10)||1})} className={gridInputClass} title="Grid height (auto-calculated, adjustable)"/>
                <span className="text-xs text-green-400 ml-1">Auto</span>
              </div>

              <div className="flex items-center space-x-1" title="Apply pre-defined zone and grid settings for single-family house">
                <Home size={iconSize-2} className="text-green-400" />
                <button onClick={onQuickZoneSetup} className={`${secondaryButtonClass} text-xs px-2 py-1`} disabled={!pdfLoaded}>Quick Setup</button>
              </div>
               <button onClick={onToggleGridOverlay} className={`${iconButtonClass} px-2`} disabled={!pdfLoaded} title={showGridOverlay ? "Hide Grid Overlay" : "Show Grid Overlay"}>
                  {showGridOverlay ? <EyeOff size={iconSize-2} /> : <Eye size={iconSize-2} />}
              </button>

              <div className="flex flex-col items-start space-y-1 border-l border-gray-600 pl-2 ml-2">
                <div className="flex items-center space-x-2">
                    <h3 className="text-sm font-semibold text-gray-200 whitespace-nowrap">
                        Elements <span className="text-xs font-normal text-green-400">(Stairs, Entries, Balconies)</span>
                    </h3>
                </div>
                <div className="text-xs text-gray-400 bg-gray-900 p-1.5 rounded shadow-sm">
                  Quick Keys: <kbd className="px-1 py-0.5 bg-gray-700 rounded">1</kbd> Stair, <kbd className="px-1 py-0.5 bg-gray-700 rounded">2</kbd> Entry, <kbd className="px-1 py-0.5 bg-gray-700 rounded">3</kbd> Balcony, <kbd className="px-1 py-0.5 bg-gray-700 rounded">ESC</kbd> Cancel
                </div>
                <div className="flex items-center space-x-1.5">
                    {structuralElementTypes.map(({ type, label, icon: Icon, shortcut }) => {
                        const isActive = structuralElementMode === 'place' && pendingElementType === type;
                        let buttonClasses = secondaryButtonClass;
                        if (isActive) {
                            buttonClasses = `${secondaryButtonClass} bg-yellow-600 hover:bg-yellow-700 text-white`;
                        }

                        return (
                        <button
                            key={type}
                            onClick={() => onToggleStructuralMode(type)}
                            className={`${buttonClasses} text-xs px-2 py-1`}
                            disabled={!pdfLoaded}
                            title={`Click to place ${label.toLowerCase()} (Shortcut: ${shortcut})`}
                            aria-pressed={isActive}
                        >
                            <Icon size={14} className="mr-1" />
                            {label} ({shortcut}) {isActive && '(Active)'}
                        </button>
                        );
                    })}
                </div>
              </div>
            </div>
            
            {/* Wall Drawing Mode Selector - Deprecated */}
            {/* 
            {pdfLoaded && (
              <div className="flex items-center space-x-2 mt-2 pt-2 md:mt-1 md:pt-0">
                <label htmlFor="wall-drawing-mode-select" className="text-xs font-medium text-gray-400 whitespace-nowrap">
                  Wall Drawing Mode:
                </label>
                <select
                  id="wall-drawing-mode-select"
                  value={wallDrawingMode}
                  onChange={(e) => onWallDrawingModeChange(e.target.value as 'freehand' | 'grid_snap')}
                  className={`${selectClass} text-xs py-1 h-auto w-auto`}
                  title="Select Wall Drawing Mode (Grid Snap recommended)"
                  disabled={!pdfLoaded}
                >
                  <option value="grid_snap">Grid Snap ✅</option>
                  <option value="freehand">Freehand ⚠️</option>
                </select>
              </div>
            )}
            */}

            {(nonWallElementsCount > 0 || wallCount > 0) && (
              <div className="flex items-center space-x-2 text-xs mt-1 pt-1 border-t border-gray-700 md:border-none md:mt-1 md:pt-1 md:ml-0 md:pl-0">
                  <span className="text-gray-400">Annotated:</span>
                  {stairCount > 0 && <span className="text-orange-400">{stairCount} stair{stairCount === 1 ? '' : 's'}</span>}
                  {entranceCount > 0 && <span className="text-lime-400">{entranceCount} entr{entranceCount === 1 ? '.' : 's.'}</span>}
                  {balconyCount > 0 && <span className="text-cyan-400">{balconyCount} balc{balconyCount === 1 ? '.' : 's.'}</span>}
                  {wallCount > 0 && ( <span className={wallCountColor}> ({wallCount} wall segment{wallCount === 1 ? '' : 's'})</span> )}
                  <span className="text-xs text-gray-400">({nonWallElementsCount} focus elements)</span>
                  {structuralElements.length > 0 && (
                    <button onClick={() => onDeleteStructuralElement(structuralElements.length - 1)} className={`${iconButtonClass} p-1 text-red-400 hover:text-red-300 hover:bg-red-700`} title="Remove last added element">
                        <Trash2 size={14} />
                    </button>
                  )}
              </div>
            )}
            <ZoneValidationWarning totalZoneGrids={totalZoneGrids} availableGrids={availableGrids} />
            {structuralElementMode === 'place' && pendingElementType !== 'structural_wall' && (
              <div className="text-xs text-yellow-300 mt-1 flex items-center animate-pulse" role="status">
                <div className="w-2 h-2 bg-yellow-400 rounded-full animate-ping mr-1.5"></div>
                <span className="font-medium">Placing {pendingElementType}:</span>
                <span className="ml-1">Click or drag on canvas • Press ESC to cancel.</span>
              </div>
            )}
          </div> 
        )}


        <div className="flex items-center justify-center space-x-2 flex-grow-0 md:flex-grow md:justify-center">
          <button onClick={onPrevPage} disabled={isPrevDisabled || !pdfLoaded} className={iconButtonClass}><ArrowLeftCircle size={iconSize} /></button>
          <span className="text-gray-300 tabular-nums whitespace-nowrap">Page {pdfLoaded ? currentPage : '-'} / {pdfLoaded ? totalPages : '-'}</span>
          <button onClick={onNextPage} disabled={isNextDisabled || !pdfLoaded} className={iconButtonClass}><ArrowRightCircle size={iconSize} /></button>
          <span className="mx-2 text-gray-600 hidden md:inline">|</span>
          <button onClick={onZoomOut} disabled={isZoomOutDisabled || !pdfLoaded} className={iconButtonClass}><ZoomOut size={iconSize} /></button>
          <button onClick={onZoomReset} disabled={!pdfLoaded} className={iconButtonClass}><RotateCcw size={iconSize-2} /></button>
          <button onClick={onZoomIn} disabled={isZoomInDisabled || !pdfLoaded} className={iconButtonClass}><ZoomIn size={iconSize} /></button>
           <span className="text-gray-300 tabular-nums text-sm w-16 text-center bg-gray-700 px-2 py-1.5 rounded-md h-[38px] flex items-center justify-center" title="Current Zoom Level">
            {pdfLoaded ? `${Math.round(viewZoomLevel * 100)}%` : '---%'}
          </span>
        </div>

        <div className="flex items-center space-x-3 flex-shrink-0">
          <div className="flex items-center space-x-1.5">
            <Settings2 size={iconSize-2} className="text-gray-400" />
            <label htmlFor="dpi-input" className="text-sm font-medium text-gray-300">DPI:</label>
            <input id="dpi-input" type="number" min="72" step="10" value={dpi} onChange={(e) => onDpiChange(parseInt(e.target.value,10))} className={inputBaseClass} disabled={!pdfLoaded} title="Output Dots Per Inch"/>
          </div>
          <div className="flex items-center space-x-1.5">
            <CaseSensitive size={iconSize-2} className="text-gray-400" />
            <label htmlFor="scale-input" className="text-sm font-medium text-gray-300">Scale 1:</label>
            <input id="scale-input" type="number" min="1" step="1" value={drawingScaleDenominator} onChange={(e) => onDrawingScaleChange(parseInt(e.target.value,10))} className={inputBaseClass} disabled={!pdfLoaded} title="Drawing Scale Denominator"/>
          </div>
          <div className="flex items-center space-x-1.5">
            <label className="text-sm font-medium text-gray-300">Export:</label>
            <div className="flex rounded-md shadow-sm" role="group">
              <button 
                onClick={() => onExportFormatChange('grayscale')} 
                className={`px-3 py-1.5 text-xs font-medium rounded-l-md border ${
                  exportFormat === 'grayscale' 
                    ? 'bg-sky-600 text-white border-sky-600' 
                    : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                } transition-colors`}
                disabled={!pdfLoaded}
                title="Recommended for AI training"
              >
                Grayscale
              </button>
              <button 
                onClick={() => onExportFormatChange('color')} 
                className={`px-3 py-1.5 text-xs font-medium rounded-r-md border-t border-r border-b ${
                  exportFormat === 'color' 
                    ? 'bg-sky-600 text-white border-sky-600' 
                    : 'bg-gray-700 text-gray-300 border-gray-600 hover:bg-gray-600'
                } transition-colors`}
                disabled={!pdfLoaded}
              >
                Color
              </button>
            </div>
          </div>
          {hasPhase1Metadata && (
            <button onClick={onDownloadPhase1Json} className={`${secondaryButtonClass} whitespace-nowrap`}>
              <Download size={iconSize} className="mr-2" />
              Phase 1 JSON
            </button>
          )}
          <button onClick={onProcess} disabled={isProcessing || !pdfLoaded} className={`${primaryButtonClass} whitespace-nowrap`}>
            {isProcessing ? ( <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24"> <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle> <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path> </svg> ) : ( <Download size={iconSize} className="mr-2" /> )}
            {isProcessing ? 'Processing...' : 'Save PNG & JSON'}
          </button>
        </div>
      </div>
    </div>
  );
};
