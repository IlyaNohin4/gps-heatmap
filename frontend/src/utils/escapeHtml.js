/** Escape HTML metacharacters before interpolating user-controlled text
 * into a Leaflet popup/tooltip HTML string (bindPopup/bindTooltip render
 * string content as innerHTML, so React's own escaping doesn't apply). */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}
