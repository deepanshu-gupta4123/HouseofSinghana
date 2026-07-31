const db = require('../db');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// Root uploads directory
const UPLOADS_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

/**
 * Handle file upload, calculate SHA-256 checksum, deduplicate, and record to DB
 */
async function uploadMedia(req, res) {
    if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded.' });
    }

    const tempPath = req.file.path;
    const fileName = req.file.originalname;
    const fileSize = req.file.size;
    const fileType = req.file.mimetype;

    try {
        // 1. Calculate SHA-256 checksum of the uploaded file
        const fileBuffer = fs.readFileSync(tempPath);
        const checksum = crypto.createHash('sha256').update(fileBuffer).digest('hex');

        // 2. Query DB to check if this exact file checksum already exists
        const existingMedia = await db.get(
            `SELECT * FROM media_library WHERE checksum = ? AND deleted_at IS NULL`,
            [checksum]
        );

        if (existingMedia) {
            // Deduplicate: Clean up the temporarily uploaded file on disk
            fs.unlinkSync(tempPath);
            console.log(`[MediaLibrary] Deduplicated file "${fileName}". Referring to existing record ID: ${existingMedia.id}`);
            return res.json({
                message: 'File upload deduplicated successfully.',
                media: existingMedia
            });
        }

        // 3. Move file to permanent destination
        const fileExt = path.extname(fileName);
        const finalFileName = `${checksum}${fileExt}`;
        const finalPath = path.join(UPLOADS_DIR, finalFileName);

        fs.renameSync(tempPath, finalPath);

        const relativePath = `/uploads/${finalFileName}`;

        // 4. Save to database
        const result = await db.run(
            `INSERT INTO media_library (
                file_name, file_path, file_type, file_size, checksum, uploaded_by
             ) VALUES (?, ?, ?, ?, ?, ?)`,
            [fileName, relativePath, fileType, fileSize, checksum, req.user ? req.user.id : 1]
        );

        const newMedia = await db.get(`SELECT * FROM media_library WHERE id = ?`, [result.lastID]);
        
        if (req.logAudit) {
            await req.logAudit('UPLOAD_MEDIA', 'media_library', result.lastID, null, newMedia);
        }

        res.status(201).json({
            message: 'File uploaded and logged successfully.',
            media: newMedia
        });

    } catch (err) {
        // Clean up temp file if error occurs
        if (fs.existsSync(tempPath)) {
            fs.unlinkSync(tempPath);
        }
        console.error('[MediaLibrary] File upload process failed:', err);
        res.status(500).json({ error: 'Failed to process file upload.' });
    }
}

/**
 * List all items in the media library
 */
async function listMedia(req, res) {
    try {
        const rows = await db.all(
            `SELECT m.*, u.name as uploaded_by_name 
             FROM media_library m
             LEFT JOIN users u ON m.uploaded_by = u.id
             WHERE m.deleted_at IS NULL 
             ORDER BY m.id DESC`
        );
        res.json(rows);
    } catch (err) {
        console.error('[MediaLibrary] listMedia failed:', err);
        res.status(500).json({ error: 'Failed to retrieve media library.' });
    }
}

/**
 * Delete a media item (Soft delete)
 */
async function deleteMedia(req, res) {
    const { id } = req.params;
    try {
        const oldMedia = await db.get(`SELECT * FROM media_library WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (!oldMedia) return res.status(404).json({ error: 'Media asset not found.' });

        await db.run(
            `UPDATE media_library SET deleted_at = CURRENT_TIMESTAMP WHERE id = ?`,
            [id]
        );

        // Optional: Keep file on disk, but soft deleted in DB to preserve historical reference integrity.
        if (req.logAudit) {
            await req.logAudit('DELETE_MEDIA', 'media_library', id, oldMedia, { ...oldMedia, deleted_at: 'now' });
        }

        res.json({ success: true, message: 'Media asset soft-deleted successfully.' });
    } catch (err) {
        console.error('[MediaLibrary] deleteMedia failed:', err);
        res.status(500).json({ error: 'Failed to delete media asset.' });
    }
}

module.exports = {
    uploadMedia,
    listMedia,
    deleteMedia
};
