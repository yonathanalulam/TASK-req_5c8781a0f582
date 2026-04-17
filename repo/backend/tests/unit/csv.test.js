const { parseCsvToObjects, objectsToCsv } = require('../../src/utils/csv');

describe('csv utils', () => {
  test('parses headers and rows with quoting', () => {
    const text = `a,b,c\n1,2,"3, with comma"\n"line ""break""",y,z\n`;
    const r = parseCsvToObjects(text, { strictColumns: false });
    expect(r.headers).toEqual(['a','b','c']);
    expect(r.rows.length).toBe(2);
    expect(r.rows[0].values.c).toBe('3, with comma');
    expect(r.rows[1].values.a).toBe('line "break"');
  });
  test('strict expected columns', () => {
    expect(() => parseCsvToObjects('a,b\n1,2\n', { strictColumns: true, expectedColumns: ['a','c'] })).toThrow();
  });
  test('serializes with escaping', () => {
    const csv = objectsToCsv([{ a: 'foo', b: 'he said "hi"' }], ['a','b']);
    expect(csv).toContain('"he said ""hi"""');
  });
});
