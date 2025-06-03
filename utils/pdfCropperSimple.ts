import { PDFDocument } from 'pdf-lib';
import type { PdfPointCropArea } from '../types';
import type { CroppedPdfResult } from './pdfCropper';

/**
 * Simplified PDF cropping using CropBox only
 * This is a fallback implementation if the main cropper has issues
 */
export async function cropPdfToVectorSimple(
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
  
  // Calculate the crop box in PDF coordinates (bottom-left origin)
  const cropBox = {
    x: cropBounds.x,
    y: originalMediaBox.height - (cropBounds.y + cropBounds.height),
    width: cropBounds.width,
    height: cropBounds.height
  };
  
  console.log('Simple PDF Crop:', {
    originalMediaBox,
    inputCropBounds: cropBounds,
    calculatedCropBox: cropBox
  });
  
  // Set CropBox using correct coordinates (x1, y1, x2, y2)
  const x1 = cropBox.x;
  const y1 = cropBox.y;
  const x2 = cropBox.x + cropBox.width;
  const y2 = cropBox.y + cropBox.height;
  
  copiedPage.setCropBox(x1, y1, x2, y2);
  
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