const db = require('../db');
const eventBus = require('../core/eventBus');

/**
 * Customer: Submit review for a product
 */
async function customerCreateReview(req, res) {
    const { order_id, product_id, rating, headline, comment } = req.body;
    if (!product_id || !rating) {
        return res.status(400).json({ error: 'Product ID and Rating (1-5) are required.' });
    }

    try {
        const result = await db.run(
            `INSERT INTO reviews (
                order_id, product_id, customer_id, rating, headline,
                review_text, status, created_by, updated_by
            ) VALUES (?, ?, ?, ?, ?, ?, 'PENDING', ?, ?)`,
            [
                order_id || null, product_id, req.user.id, rating, headline || '',
                comment || '', req.user.id, req.user.id
            ]
        );

        const newReview = await db.get(`SELECT * FROM reviews WHERE id = ?`, [result.lastID]);

        // Emit review submitted event
        await eventBus.publish('ReviewSubmitted', {
            aggregateType: 'review',
            aggregateId: String(result.lastID),
            payload: newReview,
            userId: req.user.id
        });

        res.status(201).json({
            success: true,
            message: 'Review submitted for moderation. Thank you!',
            review: newReview
        });
    } catch (err) {
        console.error('[Reviews] customerCreateReview failed:', err);
        res.status(500).json({ error: 'Failed to submit review.' });
    }
}

/**
 * Merchant OS: List reviews for moderation
 */
async function listReviews(req, res) {
    const { status } = req.query; // 'PENDING', 'APPROVED', 'HIDDEN', 'ARCHIVED'
    try {
        let query = `
            SELECT r.*, r.review_text as comment, p.name as product_name, cust.name as customer_name
            FROM reviews r
            JOIN products p ON r.product_id = p.id
            LEFT JOIN customers cust ON r.customer_id = cust.id
            WHERE r.deleted_at IS NULL
        `;
        const params = [];

        if (status) {
            query += ` AND r.status = ?`;
            params.push(status.toUpperCase());
        }

        query += ` ORDER BY r.created_at DESC`;

        const rows = await db.all(query, params);
        res.json(rows);
    } catch (err) {
        console.error('[Reviews] listReviews failed:', err);
        res.status(500).json({ error: 'Failed to fetch reviews.' });
    }
}

/**
 * Merchant OS: Moderate a review status (No deletion policy)
 */
async function moderateReview(req, res) {
    const { id } = req.params;
    const { status } = req.body; // 'APPROVED', 'HIDDEN', 'ARCHIVED' (NEVER DELETE)

    const allowed = ['APPROVED', 'HIDDEN', 'ARCHIVED'];
    if (!status || !allowed.includes(status.toUpperCase())) {
        return res.status(400).json({ error: 'Valid moderation status is required.' });
    }

    try {
        const oldReview = await db.get(`SELECT * FROM reviews WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (!oldReview) return res.status(404).json({ error: 'Review not found.' });

        await db.run(
            `UPDATE reviews 
             SET status = ?, updated_by = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [status.toUpperCase(), req.user.id, id]
        );

        const updatedReview = await db.get(`SELECT * FROM reviews WHERE id = ?`, [id]);

        if (req.logAudit) {
            await req.logAudit('MODERATE_REVIEW', 'reviews', id, oldReview, updatedReview);
        }

        // Emit moderation event
        await eventBus.publish('ReviewModerated', {
            aggregateType: 'review',
            aggregateId: String(id),
            payload: updatedReview,
            userId: req.user.id
        });

        res.json({
            message: `Review successfully moderated as ${status}.`,
            review: updatedReview
        });
    } catch (err) {
        console.error('[Reviews] moderateReview failed:', err);
        res.status(500).json({ error: 'Failed to moderate review.' });
    }
}

/**
 * Merchant OS: Log official merchant response response
 */
async function respondToReview(req, res) {
    const { id } = req.params;
    const { merchant_response } = req.body;

    if (!merchant_response) {
        return res.status(400).json({ error: 'Response content is required.' });
    }

    try {
        const oldReview = await db.get(`SELECT * FROM reviews WHERE id = ? AND deleted_at IS NULL`, [id]);
        if (!oldReview) return res.status(404).json({ error: 'Review not found.' });

        await db.run(
            `UPDATE reviews 
             SET merchant_response = ?, responded_at = CURRENT_TIMESTAMP, updated_by = ?, updated_at = CURRENT_TIMESTAMP 
             WHERE id = ?`,
            [merchant_response, req.user.id, id]
        );

        const updatedReview = await db.get(`SELECT * FROM reviews WHERE id = ?`, [id]);

        if (req.logAudit) {
            await req.logAudit('RESPOND_TO_REVIEW', 'reviews', id, oldReview, updatedReview);
        }

        res.json({
            message: 'Merchant response saved successfully.',
            review: updatedReview
        });
    } catch (err) {
        console.error('[Reviews] respondToReview failed:', err);
        res.status(500).json({ error: 'Failed to record merchant response.' });
    }
}

module.exports = {
    customerCreateReview,
    listReviews,
    moderateReview,
    respondToReview
};
