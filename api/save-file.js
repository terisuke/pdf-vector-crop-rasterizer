import fs from 'fs';
import multer from 'multer';
import path from 'path';
import { fileURLToPath } from 'url';
import { v4 as uuidv4 } from 'uuid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

const upload = multer();

export default function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  upload.single('file')(req, res, (err) => {
    if (err) {
      console.error('Multer error:', err);
      return res.status(500).json({ error: 'Upload failed' });
    }

    try {
      const file = req.file;
      if (!file) {
        return res.status(400).json({ error: 'No file provided' });
      }

      // ファイルバリデーション
      const allowedMimeTypes = ['application/pdf', 'image/png'];
      const maxFileSize = 10 * 1024 * 1024; // 10MB
      if (!allowedMimeTypes.includes(file.mimetype)) {
        return res.status(400).json({ error: 'Invalid file type. Only PDF and PNG are allowed.' });
      }
      if (file.size > maxFileSize) {
        return res.status(400).json({ error: 'File size exceeds 10MB limit.' });
      }

      // ファイル名サニタイズ＆一意化
      const uploadsDir = path.join(projectRoot, 'uploads');
      if (!fs.existsSync(uploadsDir)) {
        fs.mkdirSync(uploadsDir, { recursive: true });
      }
      const ext = path.extname(file.originalname).replace(/[^.a-zA-Z0-9]/g, '');
      const safeFilename = uuidv4() + ext;
      const filePath = path.join(uploadsDir, safeFilename);
      fs.writeFile(filePath, file.buffer, (writeErr) => {
        if (writeErr) {
          console.error('Save file error:', writeErr);
          return res.status(500).json({ error: 'Failed to save file' });
        }
        console.log(`✅ Saved file: ${filePath}`);
        res.status(200).json({ 
          success: true, 
          message: `File saved: ${safeFilename}`,
          path: filePath 
        });
      });
    } catch (error) {
      console.error('Save file error:', error);
      res.status(500).json({ error: 'Failed to save file' });
    }
  });
}

export const config = {
  api: {
    bodyParser: false,
  },
};