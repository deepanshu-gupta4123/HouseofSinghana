/**
 * QR Code Generator Utility
 * 
 * Generates QR code data URLs for order tracking, packing slips, etc.
 * Uses a simple ASCII-based QR representation for v1.0 (no external dependency).
 * Can be swapped with 'qrcode' npm package for production.
 */

/**
 * Generate a QR code SVG string for the given data
 * @param {string} data - The text/URL to encode
 * @param {number} size - SVG dimensions in pixels (default: 150)
 * @returns {string} SVG string
 */
function generateQrSvg(data, size = 150) {
    // Simple deterministic pattern generator for QR-like appearance
    // In production, replace with actual QR encoding library
    const modules = 21; // 21x21 grid (Version 1 QR)
    const cellSize = size / modules;
    
    // Generate a deterministic pattern from the data hash
    const hash = simpleHash(data);
    
    let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">`;
    svg += `<rect width="${size}" height="${size}" fill="white"/>`;
    
    // Draw finder patterns (3 corners)
    svg += drawFinderPattern(0, 0, cellSize);
    svg += drawFinderPattern((modules - 7) * cellSize, 0, cellSize);
    svg += drawFinderPattern(0, (modules - 7) * cellSize, cellSize);
    
    // Draw data modules based on hash
    for (let row = 0; row < modules; row++) {
        for (let col = 0; col < modules; col++) {
            // Skip finder pattern areas
            if ((row < 8 && col < 8) || (row < 8 && col >= modules - 8) || (row >= modules - 8 && col < 8)) continue;
            
            const bit = (hash[(row * modules + col) % hash.length] ^ row ^ col) & 1;
            if (bit) {
                svg += `<rect x="${col * cellSize}" y="${row * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
            }
        }
    }
    
    svg += `</svg>`;
    return svg;
}

/**
 * Generate a data URL for embedding in HTML
 */
function generateQrDataUrl(data, size = 150) {
    const svg = generateQrSvg(data, size);
    const base64 = Buffer.from(svg).toString('base64');
    return `data:image/svg+xml;base64,${base64}`;
}

/**
 * Generate QR code URL for an order (links to Merchant OS order detail)
 */
function generateOrderQr(orderId, baseUrl = 'http://localhost:3000') {
    const url = `${baseUrl}/admin.html#orders/${orderId}`;
    return generateQrDataUrl(url);
}

// --- Helper Functions ---

function drawFinderPattern(x, y, cellSize) {
    let svg = '';
    // Outer border (7x7)
    for (let r = 0; r < 7; r++) {
        for (let c = 0; c < 7; c++) {
            const isOuter = r === 0 || r === 6 || c === 0 || c === 6;
            const isInner = r >= 2 && r <= 4 && c >= 2 && c <= 4;
            if (isOuter || isInner) {
                svg += `<rect x="${x + c * cellSize}" y="${y + r * cellSize}" width="${cellSize}" height="${cellSize}" fill="black"/>`;
            }
        }
    }
    return svg;
}

function simpleHash(str) {
    const result = [];
    let h = 0x811c9dc5;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 0x01000193);
    }
    for (let i = 0; i < 500; i++) {
        h = Math.imul(h, 0x01000193) ^ i;
        result.push(Math.abs(h) & 0xff);
    }
    return result;
}

module.exports = {
    generateQrSvg,
    generateQrDataUrl,
    generateOrderQr
};
