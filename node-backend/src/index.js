// FieldConnect Backend
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');

// Import routes
const authRoutes = require('./routes/auth.routes');
const importRoutes = require('./routes/import.routes');
const reportsRoutes = require('./routes/reports.routes');
const projectsRoutes = require('./routes/projects.routes');
const dailyLogsRoutes = require('./routes/daily-logs.routes');
const eventsRoutes = require('./routes/events.routes');
const transcriptsRoutes = require('./routes/transcripts.routes');
const insightsRoutes = require('./routes/insights.routes');
const templatesRoutes = require('./routes/templates.routes');
const documentSchemaRoutes = require('./routes/document-schema.routes');

// Import middleware
const errorHandler = require('./middleware/error-handler.middleware');
const { authenticate } = require('./middleware/auth.middleware');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration - allow multiple origins for development
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:8081',
  'http://127.0.0.1:8081',
  'http://localhost:19006',
  process.env.CORS_ORIGIN
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc)
    if (!origin) return callback(null, true);
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }
    // In development, allow all localhost origins
    if (origin.includes('localhost') || origin.includes('127.0.0.1')) {
      return callback(null, true);
    }
    callback(new Error('Not allowed by CORS'));
  },
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));

// Body parsing middleware
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Static file serving for uploads
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Auth Routes (public)
app.use('/api/auth', authRoutes);

// Protected API Routes (require authentication)
app.use('/api/import', authenticate, importRoutes);
app.use('/api/reports', authenticate, reportsRoutes);
app.use('/api/projects', authenticate, projectsRoutes);
app.use('/api/daily-logs', authenticate, dailyLogsRoutes);
app.use('/api/events', authenticate, eventsRoutes);
app.use('/api/transcripts', authenticate, transcriptsRoutes);
app.use('/api/insights', insightsRoutes); // Auth handled in route file
app.use('/api/templates', templatesRoutes); // Auth handled in route file
app.use('/api/document-schemas', documentSchemaRoutes); // Auth handled in route file

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.path} not found` });
});

// Global error handler
app.use(errorHandler);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
  console.log(`Health check: http://localhost:${PORT}/health`);
  console.log(`API base: http://localhost:${PORT}/api`);
});

module.exports = app;
