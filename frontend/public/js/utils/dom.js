/**
 * DOM utility helpers — tiny wrappers to keep call-sites clean.
 */

/** @param {string} id @returns {HTMLElement} */
export const $     = id => document.getElementById(id);

/** @param {string} selector @returns {HTMLElement} */
export const qs    = selector => document.querySelector(selector);

/** @param {string} selector @returns {NodeList} */
export const qsa   = selector => document.querySelectorAll(selector);

/**
 * Create an element with optional class and inner HTML.
 * @param {string} tag
 * @param {string} [cls]
 * @param {string} [html]
 * @returns {HTMLElement}
 */
export function el(tag, cls, html) {
  const node = document.createElement(tag);
  if (cls)  node.className = cls;
  if (html) node.innerHTML = html;
  return node;
}

/**
 * Escape a string for safe insertion as HTML text.
 * @param {unknown} str
 * @returns {string}
 */
export function escHtml(str) {
  return String(str)
    .replace(/&/g,  '&amp;')
    .replace(/</g,  '&lt;')
    .replace(/>/g,  '&gt;')
    .replace(/"/g,  '&quot;')
    .replace(/'/g,  '&#39;');
}
