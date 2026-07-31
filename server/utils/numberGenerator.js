/**
 * Number Generator Utility
 * 
 * Generates formatted sequential identifiers for business entities.
 * All numbers include a prefix and date component for traceability.
 */

/**
 * Generate a unique order number
 * Format: HOS-YYYYMMDD-XXXXX (e.g. HOS-20260725-00042)
 */
function generateOrderNumber(sequenceNumber) {
    const date = new Date();
    const dateStr = date.getFullYear().toString() +
        (date.getMonth() + 1).toString().padStart(2, '0') +
        date.getDate().toString().padStart(2, '0');
    const seq = String(sequenceNumber || Math.floor(Math.random() * 99999) + 1).padStart(5, '0');
    return `HOS-${dateStr}-${seq}`;
}

/**
 * Generate a batch number
 * Format: BAT-YYYYMMDD-XXX (e.g. BAT-20260725-001)
 */
function generateBatchNumber(sequenceNumber) {
    const date = new Date();
    const dateStr = date.getFullYear().toString() +
        (date.getMonth() + 1).toString().padStart(2, '0') +
        date.getDate().toString().padStart(2, '0');
    const seq = String(sequenceNumber || Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `BAT-${dateStr}-${seq}`;
}

/**
 * Generate an invoice number
 * Format: INV-YYMM-XXXXX (e.g. INV-2607-00042)
 */
function generateInvoiceNumber(sequenceNumber) {
    const date = new Date();
    const yymm = date.getFullYear().toString().slice(-2) + (date.getMonth() + 1).toString().padStart(2, '0');
    const seq = String(sequenceNumber || Math.floor(Math.random() * 99999) + 1).padStart(5, '0');
    return `INV-${yymm}-${seq}`;
}

/**
 * Generate a complaint/ticket number
 * Format: TKT-YYYYMMDD-XXX (e.g. TKT-20260725-001)
 */
function generateTicketNumber(sequenceNumber) {
    const date = new Date();
    const dateStr = date.getFullYear().toString() +
        (date.getMonth() + 1).toString().padStart(2, '0') +
        date.getDate().toString().padStart(2, '0');
    const seq = String(sequenceNumber || Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `TKT-${dateStr}-${seq}`;
}

/**
 * Generate an audit reference number
 * Format: AUD-YYYYMMDD-XXX (e.g. AUD-20260725-001)
 */
function generateAuditNumber(sequenceNumber) {
    const date = new Date();
    const dateStr = date.getFullYear().toString() +
        (date.getMonth() + 1).toString().padStart(2, '0') +
        date.getDate().toString().padStart(2, '0');
    const seq = String(sequenceNumber || Math.floor(Math.random() * 999) + 1).padStart(3, '0');
    return `AUD-${dateStr}-${seq}`;
}

/**
 * Generate a referral code
 * Format: REF-XXXX (e.g. REF-A7K2)
 */
function generateReferralCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No I, O, 0, 1 for readability
    let code = '';
    for (let i = 0; i < 6; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `REF-${code}`;
}

/**
 * Generate a coupon code
 * Format: HOS-XXXXXXXX (e.g. HOS-SPICE2026)
 */
function generateCouponCode(prefix = 'HOS') {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 8; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return `${prefix}-${code}`;
}

module.exports = {
    generateOrderNumber,
    generateBatchNumber,
    generateInvoiceNumber,
    generateTicketNumber,
    generateAuditNumber,
    generateReferralCode,
    generateCouponCode
};
