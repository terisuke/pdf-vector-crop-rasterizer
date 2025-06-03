
import type { PDFDocumentProxy, PDFPageProxy } from 'pdfjs-dist';

export interface PdfPointCropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface CanvasPixelCropArea {
  x: number;
  y: number;
  width: number;
  height: number;
}

// For PDF.js Document and Page proxies
export type { PDFDocumentProxy, PDFPageProxy };

// New interfaces for enhanced layout metadata
export interface GridDimensions {
  width_grids: number;   // Number of grid cells horizontally
  height_grids: number;  // Number of grid cells vertically
}

export type ZoneType = 'living' | 'private' | 'service' | 'circulation';
export interface ZoneDefinition {
  type: ZoneType;
  approximate_grids: number;
  priority: number; // 1-3, with 1 being highest priority
}

export type StructuralElementType = 'stair' | 'entrance' | 'balcony' | 'structural_wall';
export interface StructuralElement {
  type: StructuralElementType;
  grid_x: number;         // Supports floating-point values (e.g., 2.35)
  grid_y: number;         // Supports floating-point values (e.g., 1.78)
  grid_width?: number;    // Supports floating-point values (e.g., 1.5)
  grid_height?: number;   // Supports floating-point values (e.g., 2.25)
  line_start?: { grid_x: number; grid_y: number }; // For line-based walls
  line_end?: { grid_x: number; grid_y: number };   // For line-based walls
  wall_thickness?: number; // For line-based walls, in grid units (e.g. 0.1 for a 10cm wall if grid is 1m)
  name?: string; // Optional label for user reference
}

export interface ElementSummary {
  total_elements: number;
  stair_count: number;
  entrance_count: number;
  balcony_count: number;
}

export interface AnnotationMetadata {
  annotator_version: string;
  annotation_time: string;
  floor_type: string;
  grid_resolution: string;
  drawing_scale: string;
}

export interface ExportSettings {
  format: 'grayscale' | 'color';
  optimized_for?: string;
  color_space?: string;
}

export interface LayoutMetadata {
  grid_px: number;
  grid_mm: number;
  floor: string;
  layout_bounds: GridDimensions;
  major_zones: ZoneDefinition[];
  structural_elements: StructuralElement[];
  total_approximate_area?: number; // in grid units or square meters based on grid_mm
  element_summary?: ElementSummary;
  annotation_metadata?: AnnotationMetadata;
  export_settings?: ExportSettings;
}

export type StructuralElementMode = 'place' | 'edit' | 'none';

// Define point types explicitly for clarity
export interface CanvasPoint { x: number; y: number; }
export interface GridPoint { grid_x: number; grid_y: number; }

export type PointCoordinate = CanvasPoint | GridPoint;

// Segment can hold either CanvasPoint or GridPoint pairs
export interface Segment<T extends PointCoordinate = PointCoordinate> {
  start: T;
  end: T;
}

export interface WallDrawingState {
  mode: 'none' | 'ready' | 'drawing';
  segments: Array<Segment>; // Defaults to Array<Segment<PointCoordinate>>
  currentStart: PointCoordinate | null;
  currentEnd: PointCoordinate | null;
  lastClickTime: number;
}
