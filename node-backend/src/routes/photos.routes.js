const express = require('express');
const router = express.Router();
const multer = require('multer');
const photosController = require('../controllers/photos.controller');
const { loadAccessibleProjects } = require('../middleware/auth.middleware');

// Use memory storage since we upload to Cloudinary (not local disk)
const storage = multer.memoryStorage();

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Invalid file type. Only JPEG, PNG, GIF, WebP, and HEIC images are allowed.'), false);
  }
};

const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  }
});

// Photo routes - all require authentication (applied in index.js) and project access
router.post('/upload', loadAccessibleProjects, upload.single('photo'), photosController.upload);
router.get('/:id', loadAccessibleProjects, photosController.get);
router.get('/:id/file', loadAccessibleProjects, photosController.getFile);
router.patch('/:id', loadAccessibleProjects, photosController.update);
router.delete('/:id', loadAccessibleProjects, photosController.delete);

module.exports = router;
