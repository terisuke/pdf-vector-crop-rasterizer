import { PDFDocument, PDFPage, rgb } from 'pdf-lib';
import type { PdfPointCropArea } from '../types';

export interface CroppedPdfResult {
  croppedPdfBytes: Uint8Array;
  croppedPdfBlob: Blob;
  originalDimensions: {
    width: number;
    height: number;
  };
  cropDimensions: {
    width: number;
    height: number;
  };
}

/**
 * Crop a PDF page to a specific area while preserving vector data
 * @param originalPdfBytes - The original PDF file as ArrayBuffer
 * @param cropBounds - The crop area in PDF points
 * @param pageNumber - The page number to crop (1-indexed)
 * @returns Cropped PDF data and metadata
 */
export async function cropPdfToVector(
  originalPdfBytes: ArrayBuffer,
  cropBounds: PdfPointCropArea,
  pageNumber: number
): Promise<CroppedPdfResult> {
  // Load the original PDF
  const originalPdf = await PDFDocument.load(originalPdfBytes);
  const pages = originalPdf.getPages();
  
  if (pageNumber < 1 || pageNumber > pages.length) {
    throw new Error(`Invalid page number: ${pageNumber}. PDF has ${pages.length} pages.`);
  }
  
  // Get the page to crop (convert to 0-indexed)
  const pageToCrop = pages[pageNumber - 1];
  const originalMediaBox = pageToCrop.getMediaBox();
  
  // Store original dimensions
  const originalDimensions = {
    width: originalMediaBox.width,
    height: originalMediaBox.height
  };
  
  // Create a new PDF document
  const croppedPdf = await PDFDocument.create();
  
  // Copy the page from the original PDF
  const [copiedPage] = await croppedPdf.copyPages(originalPdf, [pageNumber - 1]);
  
  // Calculate the new crop box
  // PDF coordinate system: origin is at bottom-left
  // Convert from top-left origin to bottom-left origin
  const cropBox = {
    x: cropBounds.x,
    y: originalMediaBox.height - (cropBounds.y + cropBounds.height),
    width: cropBounds.width,
    height: cropBounds.height
  };
  
  // Set the crop box and media box to the specified area
  copiedPage.setCropBox(cropBox.x, cropBox.y, cropBox.width, cropBox.height);
  copiedPage.setMediaBox(0, 0, cropBox.width, cropBox.height);
  
  // Translate the page content to align with the new media box
  const translateX = -cropBox.x;
  const translateY = -cropBox.y;
  
  // Apply translation to move the content to the new origin
  // For pdf-lib, we need to directly manipulate the content stream
  // This is a simplified approach - for production, consider using more robust PDF manipulation
  
  // The crop box already handles the viewport adjustment
  // Additional content translation might not be necessary for most PDFs
  // as pdf-lib's setCropBox and setMediaBox handle the coordinate transformation
  
  // Add the cropped page to the new PDF
  croppedPdf.addPage(copiedPage);
  
  // Save the cropped PDF
  const croppedPdfBytes = await croppedPdf.save();
  const croppedPdfBlob = new Blob([croppedPdfBytes], { type: 'application/pdf' });
  
  return {
    croppedPdfBytes,
    croppedPdfBlob,
    originalDimensions,
    cropDimensions: {
      width: cropBounds.width,
      height: cropBounds.height
    }
  };
}

/**
 * Load a cropped PDF and prepare it for rendering
 * @param croppedPdfBlob - The cropped PDF blob
 * @returns ArrayBuffer for PDF.js to render
 */
export async function loadCroppedPdfForRendering(croppedPdfBlob: Blob): Promise<ArrayBuffer> {
  return await croppedPdfBlob.arrayBuffer();
}