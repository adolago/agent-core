/**
 * Convert JSON data to CSV format
 * @param {Array} data - Array of data objects
 * @param {Array} fields - Array of field definitions (string or object)
 * @returns {string} CSV string
 */
const jsonToCsv = (data, fields) => {
  if (!data || !data.length) {
    return '';
  }

  // Normalize fields
  const normalizedFields = fields.map(field => {
    if (typeof field === 'string') {
      return { label: field, value: field };
    }
    return field;
  });

  // Create header row
  const header = normalizedFields.map(field => `"${field.label}"`).join(',');

  // Create body rows
  const rows = data.map(item => {
    return normalizedFields.map(field => {
      let value;
      if (typeof field.value === 'function') {
        value = field.value(item);
      } else {
        // Handle nested properties if value is 'user.name'
        value = field.value.split('.').reduce((obj, key) => (obj && obj[key] !== undefined) ? obj[key] : '', item);
      }

      // Handle null/undefined
      if (value === null || value === undefined) {
        value = '';
      }

      // Convert to string and escape quotes
      const stringValue = String(value).replace(/"/g, '""');

      return `"${stringValue}"`;
    }).join(',');
  });

  return [header, ...rows].join('\n');
};

module.exports = { jsonToCsv };
