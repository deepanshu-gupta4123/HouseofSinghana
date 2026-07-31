/**
 * CSV Exporter Utility
 * 
 * Converts arrays of objects to CSV strings for data export.
 * Used by order exports, customer exports, analytics exports.
 */

/**
 * Convert an array of objects to a CSV string
 * @param {Object[]} data - Array of flat objects
 * @param {string[]} [columns] - Optional column names (defaults to all keys from first row)
 * @returns {string} CSV formatted string
 */
function toCSV(data, columns) {
    if (!data || data.length === 0) {
        return '';
    }

    // Determine columns from first row if not provided
    const cols = columns || Object.keys(data[0]);

    // Header row
    const header = cols.map(escapeCSV).join(',');

    // Data rows
    const rows = data.map(row => {
        return cols.map(col => {
            let value = row[col];
            
            // Handle null/undefined
            if (value === null || value === undefined) return '';
            
            // Handle objects (JSON stringify)
            if (typeof value === 'object') {
                value = JSON.stringify(value);
            }
            
            return escapeCSV(String(value));
        }).join(',');
    });

    return [header, ...rows].join('\n');
}

/**
 * Escape a CSV field value
 */
function escapeCSV(value) {
    if (value.includes(',') || value.includes('"') || value.includes('\n') || value.includes('\r')) {
        return `"${value.replace(/"/g, '""')}"`;
    }
    return value;
}

/**
 * Send CSV as a downloadable response
 * @param {Object} res - Express response object
 * @param {Object[]} data - Array of flat objects
 * @param {string} filename - Download filename
 * @param {string[]} [columns] - Optional column names
 */
function sendCSV(res, data, filename, columns) {
    const csv = toCSV(data, columns);
    
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
}

module.exports = {
    toCSV,
    sendCSV
};
