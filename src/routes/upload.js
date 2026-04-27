const express = require('express');
const router = express.Router();
const multer = require('multer');
const auth = require('../middleware/auth');
const { uploadToWordPress } = require('../utils/wpUpload');

// Store file in memory — we send it straight to WordPress
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB max
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPEG, PNG, WEBP and GIF images are allowed'));
    }
  }
});

// POST /api/upload/image
router.post('/image', auth, upload.single('image'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const url = await uploadToWordPress(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype
    );

    return res.json({ url });
  } catch (err) {
    console.error('Image upload error:', err.message);
    return res.status(500).json({ error: 'Image upload failed. Please try again.' });
  }
});

module.exports = router;