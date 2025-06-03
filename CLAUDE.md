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

### Core Components

- **App.tsx** (888 lines): Main application component managing state and orchestrating the entire workflow. Handles PDF loading, crop area selection, structural element placement, and export functionality.

- **PdfViewer.tsx**: Canvas-based PDF renderer with interactive features for crop selection and structural element placement. Uses pdf.js for rendering.

- **ControlPanel.tsx**: UI controls for file upload, page navigation, DPI settings, floor selection, grid configuration, and structural element management.

### Key Data Flow

1. **PDF Processing**: Uses pdf.js library (`pdfjs-dist`) to load and render PDFs
2. **Grid System**: Converts real-world measurements (910mm grid cells) to pixel coordinates based on drawing scale
3. **Structural Elements**: Supports placement of stairs, entrances, and balconies on a grid overlay
4. **Export**: Generates PNG images with accompanying JSON metadata containing layout information

### Type System

The application uses TypeScript with strict type checking. Key types are defined in `types.ts`:
- `PdfPointCropArea`: PDF coordinate system crop area
- `GridDimensions`: Grid layout dimensions
- `StructuralElement`: Annotation elements (stairs, entrances, balconies)
- `LayoutMetadata`: Complete export metadata structure

### Important Implementation Details

- Wall drawing functionality is currently disabled (code remains but is not accessible to users)
- Grid calculations use floating-point precision for accurate placement
- Keyboard shortcuts: 1 (stairs), 2 (entrance), 3 (balcony), Escape (cancel)
- Floor-specific validation: 1F requires entrances, upper floors require stairs
- Export naming convention: `plan_{document_id}_{floor}.{png|json}`

### Dependencies

- React 19.1.0 with TypeScript
- Vite for build tooling
- pdf.js (pdfjs-dist) for PDF rendering
- lucide-react for icons
- TailwindCSS for styling (via Vite config)

### State Management

The application uses React hooks for state management with a centralized state in App.tsx. Key state includes:
- PDF document and page information
- Crop area and view settings
- Grid dimensions and structural elements
- Processing status and error handling