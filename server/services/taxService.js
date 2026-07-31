const db = require('../db');

class TaxService {
    /**
     * Compute GST details for an item amount based on HSN rules
     * @param {string} hsnCode e.g. '091091'
     * @param {number} amount item amount in paise
     */
    async calculateTax(hsnCode, amount) {
        if (!hsnCode) {
            // Default tax fallback (inclusive standard 5% tax)
            const gstAmount = Math.round(amount * 0.05);
            return {
                gstRate: 5.0,
                taxAmount: gstAmount,
                cgst: Math.round(gstAmount / 2),
                sgst: Math.round(gstAmount / 2),
                igst: 0,
                description: 'Inclusive GST Fallback'
            };
        }

        try {
            const rule = await db.get(
                `SELECT * FROM tax_rules WHERE hsn_code = ? AND is_active = 1`,
                [hsnCode]
            );

            if (!rule) {
                // Return default 5%
                const gstAmount = Math.round(amount * 0.05);
                return {
                    gstRate: 5.0,
                    taxAmount: gstAmount,
                    cgst: Math.round(gstAmount / 2),
                    sgst: Math.round(gstAmount / 2),
                    igst: 0,
                    description: 'GST Default (No rule found)'
                };
            }

            const totalGst = Math.round(amount * (rule.gst_rate / 100));
            const cgst = Math.round(amount * (rule.cgst_rate / 100));
            const sgst = Math.round(amount * (rule.sgst_rate / 100));
            const igst = Math.round(amount * (rule.igst_rate / 100));

            return {
                gstRate: rule.gst_rate,
                taxAmount: totalGst,
                cgst,
                sgst,
                igst,
                description: rule.description
            };
        } catch (err) {
            console.error('[TaxService] Failed to calculate tax:', err);
            return {
                gstRate: 5.0,
                taxAmount: Math.round(amount * 0.05),
                cgst: Math.round(amount * 0.025),
                sgst: Math.round(amount * 0.025),
                igst: 0,
                description: 'GST error fallback'
            };
        }
    }
}

const taxService = new TaxService();
module.exports = taxService;
