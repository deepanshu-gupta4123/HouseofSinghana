const templateEngine = require('../core/templateEngine');
const fs = require('fs');
const path = require('path');

class DocumentGenerator {
    /**
     * Generate HTML layout (printable) for invoices or slips
     * @param {string} templateKey e.g. 'invoice', 'packing_slip'
     * @param {object} context Data payload
     * @param {string} entityNumber Unique number e.g. ORD-1234
     */
    async generateDocument(templateKey, context, entityNumber) {
        console.log(`[DocumentGenerator] Preparing document for: ${templateKey} #${entityNumber}`);

        const html = await templateEngine.render(templateKey, context);

        const vaultDir = process.env.VERCEL
            ? path.join('/tmp', 'vault', `${templateKey}s`)
            : path.join(__dirname, '..', 'vault', `${templateKey}s`);
        if (!fs.existsSync(vaultDir)) {
            fs.mkdirSync(vaultDir, { recursive: true });
        }

        const fileName = `${templateKey.toUpperCase()}-${entityNumber}.html`;
        const filePath = path.join(vaultDir, fileName);
        fs.writeFileSync(filePath, html, 'utf8');

        return `/vault/${templateKey}s/${fileName}`;
    }
}

const documentGenerator = new DocumentGenerator();
module.exports = documentGenerator;
