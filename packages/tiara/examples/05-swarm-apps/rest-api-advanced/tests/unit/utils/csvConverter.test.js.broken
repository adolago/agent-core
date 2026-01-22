const { jsonToCsv } = require('../../../src/utils/csvConverter');

describe('CSV Converter Utility', () => {
  const mockData = [
    {
      id: 1,
      name: 'John Doe',
      email: 'john@example.com',
      details: {
        age: 30,
        city: 'New York'
      },
      tags: ['a', 'b']
    },
    {
      id: 2,
      name: 'Jane Smith',
      email: 'jane@example.com',
      details: {
        age: 25,
        city: 'Los Angeles'
      },
      tags: ['c']
    }
  ];

  test('should return empty string for empty data', () => {
    expect(jsonToCsv([], [])).toBe('');
    expect(jsonToCsv(null, [])).toBe('');
  });

  test('should convert flat data correctly', () => {
    const fields = ['id', 'name', 'email'];
    const csv = jsonToCsv(mockData, fields);

    const expected = '"id","name","email"\n"1","John Doe","john@example.com"\n"2","Jane Smith","jane@example.com"';
    expect(csv).toBe(expected);
  });

  test('should handle nested properties with string accessors', () => {
    const fields = [
      { label: 'Name', value: 'name' },
      { label: 'City', value: 'details.city' }
    ];
    const csv = jsonToCsv(mockData, fields);

    const expected = '"Name","City"\n"John Doe","New York"\n"Jane Smith","Los Angeles"';
    expect(csv).toBe(expected);
  });

  test('should handle custom value functions', () => {
    const fields = [
      { label: 'Name', value: 'name' },
      { label: 'Description', value: (row) => `${row.name} is ${row.details.age} years old` }
    ];
    const csv = jsonToCsv(mockData, fields);

    const expected = '"Name","Description"\n"John Doe","John Doe is 30 years old"\n"Jane Smith","Jane Smith is 25 years old"';
    expect(csv).toBe(expected);
  });

  test('should escape double quotes in values', () => {
    const data = [
      { id: 1, text: 'Hello "World"' },
      { id: 2, text: 'Normal text' }
    ];
    const fields = ['id', 'text'];
    const csv = jsonToCsv(data, fields);

    const expected = '"id","text"\n"1","Hello ""World"""\n"2","Normal text"';
    expect(csv).toBe(expected);
  });

  test('should handle null/undefined values', () => {
    const data = [
      { id: 1, value: null },
      { id: 2, value: undefined },
      { id: 3, value: 'test' }
    ];
    const fields = ['id', 'value'];
    const csv = jsonToCsv(data, fields);

    const expected = '"id","value"\n"1",""\n"2",""\n"3","test"';
    expect(csv).toBe(expected);
  });
});
