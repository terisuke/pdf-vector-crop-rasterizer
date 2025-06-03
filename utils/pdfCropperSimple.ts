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
  
  // Set CropBox using correct coordinates (x, y, width, height)
  copiedPage.setCropBox(cropBox.x, cropBox.y, cropBox.width, cropBox.height);
  
  // Add the cropped page to the new PDF
  croppedPdf.addPage(copiedPage);
  
  // Save the cropped PDF
  const croppedPdfBytes = await croppedPdf.save();
  // ArrayBufferへ明示的にコピー
  const ab = new Uint8Array(croppedPdfBytes).buffer;
  const croppedPdfBlob = new Blob([ab], { type: 'application/pdf' });
  
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