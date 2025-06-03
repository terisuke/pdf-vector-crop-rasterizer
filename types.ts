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
  image_format: 'grayscale' | 'color';
  optimization: string;
  color_depth: string;
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

// Phase 1: Metadata after crop selection
export interface StructuralConstraints {
  wall_thickness: {
    exterior_mm: number;
    interior_mm: number;
    load_bearing_mm: number;
  };
  room_constraints: {
    ldk: {
      layout: string;
      max_span_mm: number;
      reason: string;
    };
    [key: string]: any;
  };
  stair_constraints: {
    vertical_alignment_note: string;
    typical_configurations: {
      [key: string]: {
        "1F": { grid_width: number; grid_height: number };
        "2F": { grid_width: number; grid_height: number };
      };
    };
  };
}

export interface FloorRequirements {
  required_elements: string[];
  prohibited_elements: string[];
  notes: {
    stair_alignment: string;
    [key: string]: string;
  };
}

export interface Phase1Metadata {
  crop_id: string;
  original_pdf: string;
  floor: string;
  timestamp: string;
  grid_dimensions: GridDimensions;
  scale_info: {
    drawing_scale: string;
    grid_mm: number;
    grid_px: number;
  };
  structural_constraints: StructuralConstraints;
  floor_requirements: FloorRequirements;
  export_config: ExportSettings;
  crop_bounds_in_original: PdfPointCropArea;
  building_context: {
    type: string;
    floors_total: number;
    current_floor: string;
    typical_patterns: {
      [floor: string]: string[];
    };
    stair_patterns: {
      vertical_alignment: string;
      u_turn_benefit: string;
      size_variation: string;
    };
  };
  grid_module_info: {
    base_module_mm: number;
    common_room_grids: {
      "6_tatami": { width: number; height: number };
      "8_tatami": { width: number; height: number };
      "4.5_tatami": { width: number; height: number };
    };
    stair_grids: {
      "u_turn_1f": { width: number; height: number };
      "u_turn_2f": { width: number; height: number };
      "straight_all": { width: number; height: number };
    };
  };
  training_optimization: {
    image_format: string;
    reason: string;
    benefits: string[];
  };
}

// Phase 2: Element placement data
// 階段タイプの型を追加
export type StairType = 'straight' | 'u_turn' | 'unknown';

// 階段情報の型を追加
export interface StairInfo {
  name: string;
  type: StairType;
  grid_position: {
    x: number;
    y: number;
    width?: number;
    height?: number;
  };
  floor: string;
  alignment_note: string;
}

export interface Phase2Elements {
  crop_id: string;
  structural_elements: StructuralElement[];
  zones: ZoneDefinition[];
  stair_info?: StairInfo[];  // 追加
  validation_status: {
    passed: boolean;
    messages: string[];
  };
  annotation_metadata: {
    annotator_version: string;
    annotation_time: string;
    element_count: ElementSummary;
  };
}

export interface CompleteLayoutData extends Phase1Metadata {
  elements?: Phase2Elements;
  phase: 1 | 2;
  completed_at?: string;
}
