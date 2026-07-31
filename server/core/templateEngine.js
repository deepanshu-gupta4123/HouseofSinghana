const Handlebars = require('handlebars');
const db = require('../db');

class TemplateEngine {
    /**
     * Load, compile, and render a document template with context data
     * @param {string} templateKey e.g. 'invoice', 'packing_slip'
     * @param {object} context The template variables values
     */
    async render(templateKey, context) {
        console.log(`[TemplateEngine] Loading template for: ${templateKey}`);
        
        const templateRow = await db.get(
            `SELECT template_html, template_css FROM document_templates WHERE template_key = ? AND is_active = 1`,
            [templateKey]
        );

        if (!templateRow) {
            throw new Error(`Active template definition not found for key: ${templateKey}`);
        }

        // Compile and render HTML using Handlebars
        const compiled = Handlebars.compile(templateRow.template_html);
        const renderedHtml = compiled(context);

        // Inject the associated CSS styles if defined
        if (templateRow.template_css) {
            return `
                <html>
                <head>
                    <style>
                        ${templateRow.template_css}
                    </style>
                </head>
                <body>
                    ${renderedHtml}
                </body>
                </html>
            `;
        }

        return renderedHtml;
    }
}

const templateEngine = new TemplateEngine();
module.exports = templateEngine;
