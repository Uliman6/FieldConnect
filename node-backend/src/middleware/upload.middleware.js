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

// File filter for audio files
const audioFileFilter = (req, file, cb) => {
  const allowedMimes = [
    'audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav',
    'audio/m4a', 'audio/ogg', 'audio/aac', 'audio/x-m4a'
  ];
  const allowedExts = ['.webm', '.mp4', '.mp3', '.wav', '.m4a', '.ogg', '.aac'];
  const ext = path.extname(file.originalname).toLowerCase();

  if (allowedMimes.includes(file.mimetype) || allowedExts.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error('Only audio files are allowed'), false);
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

// Audio upload to memory (for transcription)
const uploadAudioMemory = multer({
  storage: memoryStorage,
  fileFilter: audioFileFilter,
  limits: {
    fileSize: 25 * 1024 * 1024 // 25MB max for OpenAI Whisper
  }
});

module.exports = {
  uploadJson,
  uploadJsonMemory,
  uploadAudioMemory
};
