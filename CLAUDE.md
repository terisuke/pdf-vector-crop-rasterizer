# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Running the Application
```bash
npm install        # Install dependencies
npm run dev        # Start development server (Vite)
npm run build      # Build for production
npm run preview    # Preview production build
```

### Environment Setup
The application requires a Gemini API key. Set it in `.env.local`:
```
GEMINI_API_KEY=your_api_key_here
```

## High-Level Architecture

This is a React-based PDF processing application that allows users to:
1. Load PDF files and navigate pages
2. Select crop areas on PDF pages
3. Add structural annotations (stairs, entrances, balconies)
4. Export high-DPI raster images with layout metadata
5. Manage annotation sessions with 2-phase workflow

### Core Components

- **App.tsx** (1355 lines): Main application component managing state and orchestrating the entire workflow. Handles PDF loading, crop area selection, structural element placement, 2-phase export functionality, and session management.

- **PdfViewer.tsx** (578 lines): Canvas-based PDF renderer with interactive features for crop selection and structural element placement. Uses pdf.js for rendering with coordinate transformation support for cropped areas.

- **ControlPanel.tsx** (330 lines): UI controls for file upload, page navigation, DPI settings, floor selection, grid configuration, structural element management, and session operations.

- **SessionModal.tsx**: Modal interface for loading saved annotation sessions from localStorage.

### Key Data Flow

1. **PDF Processing**: Uses pdf.js library (`pdfjs-dist`) to load and render PDFs
2. **Grid System**: Converts real-world measurements (910mm grid cells) to pixel coordinates based on drawing scale
3. **Coordinate Transformation**: Handles coordinate mapping between PDF points, canvas pixels, and logical grid units within cropped areas
4. **Structural Elements**: Supports placement of stairs, entrances, and balconies on a grid overlay
5. **2-Phase Export**: 
   - Phase 1: Crop area selection and metadata generation
   - Phase 2: Element placement and final export
6. **Session Management**: LocalStorage-based persistence of work sessions

### Recent Updates (June 2025)

**Integrated JSON Export for Diffusion Training**:
- New optional feature to export Phase1+Phase2 data in a single JSON file
- Includes all metadata necessary for Diffusion model training (grid dimensions, scale info, floor constraints)
- Checkbox in Control Panel to enable/disable (default: ON)
- Floor-aware room count estimation (1F: public spaces, 2F: private spaces)

**Critical Bug Fix**: Grid coordinates were calculated based on the full PDF canvas instead of the cropped area, leading to incorrect element positioning in exported JSON files.

**Solution**: Modified coordinate calculation system in PdfViewer.tsx:
- `calculateGridLayout()` now accepts `cropArea` parameter
- Grid calculations are relative to crop bounds, not full canvas
- App.tsx always uses original PDF with crop coordinates passed as parameter
- Ensures elements are positioned correctly within the cropped area grid (e.g., 6x10) rather than full PDF grid (e.g., 21x29)

### Type System

The application uses TypeScript with strict type checking. Key types are defined in `types.ts`:
- `PdfPointCropArea`: PDF coordinate system crop area
- `GridDimensions`: Grid layout dimensions
- `StructuralElement`: Annotation elements (stairs, entrances, balconies)
- `Phase1Metadata`: Crop and grid configuration metadata
- `Phase2Elements`: Element placement and validation data
- `LayoutMetadata`: Complete export metadata structure

### Important Implementation Details

- **Wall drawing functionality is currently disabled** (code remains but is not accessible to users)
- **Grid calculations use floating-point precision** for accurate placement (0.1 grid unit accuracy)
- **Always use original PDF document** for rendering, with crop area passed as parameter to avoid transformation issues
- **Keyboard shortcuts**: 1 (stairs), 2 (entrance), 3 (balcony), Escape (cancel)
- **Floor-specific validation**: 1F requires entrances, upper floors require stairs
- **Export naming convention**: `plan_{document_id}_{floor}.{png|json}`
- **Coordinate precision**: Elements positioned with 0.1 grid unit accuracy within cropped area
- **Session management**: Work sessions auto-saved to localStorage with format `{document_name}_{floor}`

### JSON Output System

**Phase 1 (Crop Metadata)**:
- Generated when crop area is selected
- Contains grid dimensions, scale info, crop bounds, building context
- Saved to localStorage as `phase1_{sessionId}`
- File format: `plan_{document_id}_{floor}_metadata.json`

**Phase 2 (Element Placement)**:
- Generated during final export
- Contains structural elements, validation status
- Saved to localStorage as `phase2_{sessionId}`
- File format: `plan_{document_id}_{floor}_elements.json`

**Integrated JSON (Optional, Default ON)**:
- Combines Phase 1 + Phase 2 data for Diffusion model training
- Includes training hints with floor-aware room estimation
- File format: `plan_{document_id}_{floor}_integrated.json`
- Controlled via checkbox in Control Panel when Phase 1 metadata exists

### Coordinate System Architecture

The application handles three coordinate systems:

1. **PDF Points**: Native PDF coordinate system (1pt = 1/72 inch)
2. **Canvas Pixels**: Display coordinates scaled by viewZoomLevel
3. **Grid Coordinates**: Logical grid units (1 grid = 910mm in real world)

**Critical**: Grid calculations must always be relative to the cropped area, not the full PDF canvas.

### Dependencies

- React 19.1.0 with TypeScript
- Vite for build tooling
- pdf.js (pdfjs-dist) for PDF rendering
- lucide-react for icons
- TailwindCSS for styling (via Vite config)

### State Management

The application uses React hooks for state management with a centralized state in App.tsx. Key state includes:
- PDF document and page information
- Crop area and view settings (with precise coordinate tracking)
- Grid dimensions and structural elements
- Processing status and error handling
- Session management (Phase 1/2 metadata)
- 2-phase workflow state

### Utils Directory

- **pdfCropper.ts**: Main PDF cropping implementation with content transformation
- **pdfCropperSimple.ts**: Fallback PDF cropper using CropBox only
- **logger.ts**: Debug logging utility (minimized for production)