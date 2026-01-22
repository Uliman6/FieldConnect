/**
 * Cloudinary Service - Image upload and management
 */
const cloudinary = require('cloudinary').v2;

// Configure Cloudinary from environment variables
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

class CloudinaryService {
  /**
   * Check if Cloudinary is configured
   */
  isConfigured() {
    return !!(
      process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
    );
  }

  /**
   * Upload an image buffer to Cloudinary
   * @param {Buffer} buffer - Image buffer
   * @param {object} options - Upload options
   * @returns {Promise<{success: boolean, url?: string, publicId?: string, error?: string}>}
   */
  async uploadBuffer(buffer, options = {}) {
    if (!this.isConfigured()) {
      return {
        success: false,
        error: 'Cloudinary not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, and CLOUDINARY_API_SECRET.'
      };
    }

    return new Promise((resolve) => {
      const uploadOptions = {
        folder: options.folder || 'fieldconnect/photos',
        resource_type: 'image',
        ...options
      };

      const uploadStream = cloudinary.uploader.upload_stream(
        uploadOptions,
        (error, result) => {
          if (error) {
            console.error('[cloudinary] Upload error:', error.message);
            resolve({
              success: false,
              error: error.message
            });
          } else {
            console.log('[cloudinary] Upload success:', result.public_id);
            resolve({
              success: true,
              url: result.secure_url,
              publicId: result.public_id,
              width: result.width,
              height: result.height,
              format: result.format,
              bytes: result.bytes
            });
          }
        }
      );

      uploadStream.end(buffer);
    });
  }

  /**
   * Delete an image from Cloudinary
   * @param {string} publicId - Cloudinary public ID
   * @returns {Promise<{success: boolean, error?: string}>}
   */
  async delete(publicId) {
    if (!this.isConfigured()) {
      return { success: false, error: 'Cloudinary not configured' };
    }

    try {
      const result = await cloudinary.uploader.destroy(publicId);
      if (result.result === 'ok') {
        console.log('[cloudinary] Deleted:', publicId);
        return { success: true };
      } else {
        return { success: false, error: result.result };
      }
    } catch (error) {
      console.error('[cloudinary] Delete error:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get a transformed URL for an image
   * @param {string} publicId - Cloudinary public ID
   * @param {object} transformations - Cloudinary transformations
   * @returns {string}
   */
  getUrl(publicId, transformations = {}) {
    return cloudinary.url(publicId, {
      secure: true,
      ...transformations
    });
  }

  /**
   * Get a thumbnail URL
   * @param {string} publicId - Cloudinary public ID
   * @param {number} width - Thumbnail width
   * @param {number} height - Thumbnail height
   * @returns {string}
   */
  getThumbnailUrl(publicId, width = 200, height = 200) {
    return cloudinary.url(publicId, {
      secure: true,
      width,
      height,
      crop: 'fill',
      quality: 'auto'
    });
  }
}

module.exports = new CloudinaryService();
