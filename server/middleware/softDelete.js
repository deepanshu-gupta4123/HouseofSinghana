/**
 * Soft Delete Helper Utilities
 */

/**
 * Returns the SQL segment to filter out soft-deleted records.
 * @param {string} [tableAlias] Optional table alias, e.g. 'p' -> 'p.deleted_at IS NULL'
 * @param {boolean} [includeAnd=true] If true, prepends 'AND ' to the segment
 */
function active(tableAlias = '', includeAnd = true) {
    const prefix = tableAlias ? `${tableAlias}.` : '';
    const sql = `${prefix}deleted_at IS NULL`;
    return includeAnd ? ` AND ${sql}` : ` ${sql}`;
}

/**
 * Express middleware to inject active filter helper into request
 */
function softDeleteMiddleware(req, res, next) {
    req.activeSql = active;
    next();
}

module.exports = {
    active,
    softDeleteMiddleware
};
