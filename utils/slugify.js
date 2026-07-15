/**
 * Centralized utility to convert string inputs into URL-friendly slugs.
 * E.g., "New Delhi" -> "new-delhi", "Vijay Nagar" -> "vijay-nagar"
 * 
 * @param {string} text 
 * @returns {string}
 */
function slugify(text) {
    if (!text || typeof text !== 'string') return '';
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')           // Replace spaces with -
        .replace(/[^\w\-]+/g, '')       // Remove all non-word chars
        .replace(/\-\-+/g, '-');         // Replace multiple - with single -
}

module.exports = slugify;
