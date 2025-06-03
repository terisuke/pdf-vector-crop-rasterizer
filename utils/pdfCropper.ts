import { PDFDocument } from 'pdf-lib';
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
  
  // --- cropBoundsバリデーション ---
  if (cropBounds.width <= 0 || cropBounds.height <= 0) {
    throw new Error(`Invalid crop size: width and height must be > 0. (width: ${cropBounds.width}, height: ${cropBounds.height})`);
  }
  if (cropBounds.x < 0 || cropBounds.y < 0 ||
      cropBounds.x + cropBounds.width > originalMediaBox.width ||
      cropBounds.y + cropBounds.height > originalMediaBox.height) {
    throw new Error(`Crop area is out of page bounds. Page size: ${originalMediaBox.width}x${originalMediaBox.height}, crop: x=${cropBounds.x}, y=${cropBounds.y}, w=${cropBounds.width}, h=${cropBounds.height}`);
  }
  
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
  
  // デバッグ情報をログ出力
  console.log('PDF Crop Debug Info:', {
    originalMediaBox: {
      width: originalMediaBox.width,
      height: originalMediaBox.height
    },
    inputCropBounds: cropBounds,
    calculatedCropBox: cropBox,
    coordinates: {
      x1: cropBox.x,
      y1: cropBox.y,
      x2: cropBox.x + cropBox.width,
      y2: cropBox.y + cropBox.height
    }
  });
  
  // 正しいsetCropBoxの使用方法 (x1, y1, x2, y2)
  const x1 = cropBox.x;
  const y1 = cropBox.y;
  const x2 = cropBox.x + cropBox.width;
  const y2 = cropBox.y + cropBox.height;
  
  // CropBoxを設定（4つの角の座標を指定）
  copiedPage.setCropBox(x1, y1, x2, y2);
  
  // MediaBoxを新しい座標系に設定（原点を0,0にリセット）
  copiedPage.setMediaBox(0, 0, cropBox.width, cropBox.height);
  
  // ページの変換行列を適用
  try {
    // 高レベルAPIでコンテンツを移動
    copiedPage.translateContent(-x1, -y1);
  } catch (error) {
    console.warn('Could not apply content transformation, using CropBox only:', error);
    // 変換が失敗した場合は、CropBoxのみを使用
    // この場合、PDFビューアによってはクロップが正しく表示されない可能性があるが、
    // 多くのPDFビューア（PDF.js含む）はCropBoxを正しく処理する
  }
  
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

/**
 * Load a cropped PDF and prepare it for rendering
 * @param croppedPdfBlob - The cropped PDF blob
 * @returns ArrayBuffer for PDF.js to render
 */
export async function loadCroppedPdfForRendering(croppedPdfBlob: Blob): Promise<ArrayBuffer> {
  return await croppedPdfBlob.arrayBuffer();
}