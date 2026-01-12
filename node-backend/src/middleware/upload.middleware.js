const multer = require('multer');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

// Configure storage
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, process.env.UPLOAD_DIR || './uploads');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = uuidv4();
    const ext = path.extname(file.originalname);
    cb(null, `${uniqueSuffix}${ext}`);
  }
});

// File filter for JSON files
const jsonFileFilter = (req, file, cb) => {
  if (file.mimetype === 'application/json' || path.extname(file.originalname).toLowerCase() === '.json') {
    cb(null, true);
  } else {
    cb(new Error('Only JSON files are allowed'), false);
  }
};

// Create multer instances
const uploadJson = multer({
  storage,
  fileFilter: jsonFileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024 // 50MB default
  }
});

// Memory storage for JSON (parse directly without saving)
const memoryStorage = multer.memoryStorage();

const uploadJsonMemory = multer({
  storage: memoryStorage,
  fileFilter: jsonFileFilter,
  limits: {
    fileSize: parseInt(process.env.MAX_FILE_SIZE) || 50 * 1024 * 1024
  }
});

module.exports = {
  uploadJson,
  uploadJsonMemory
};
