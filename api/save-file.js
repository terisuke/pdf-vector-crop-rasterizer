import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import multer from 'multer';

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

      const filePath = path.join(projectRoot, file.originalname);
      fs.writeFileSync(filePath, file.buffer);
      
      console.log(`✅ Saved file: ${filePath}`);
      res.status(200).json({ 
        success: true, 
        message: `File saved: ${file.originalname}`,
        path: filePath 
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