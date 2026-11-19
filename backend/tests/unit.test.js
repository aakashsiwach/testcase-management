const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { parseCsv, toCsv } = require('../src/services/csv');
const { sanitize } = require('../src/middleware/validate');
const { checkContent, safeFilename } = require('../src/middleware/upload');

describe('csv', () => {
  it('parses quoted fields, escaped quotes and newlines', () => {
    const rows = parseCsv('a,b\r\n"x, y","say ""hi""\nthere"\n');
    assert.deepEqual(rows, [['a', 'b'], ['x, y', 'say "hi"\nthere']]);
  });
  it('round-trips and neutralises formula injection', () => {
    const csv = toCsv(['t'], [{ t: '=HYPERLINK("x")' }, { t: 'a,b' }]);
    assert.deepEqual(parseCsv(csv), [['t'], [`'=HYPERLINK("x")`], ['a,b']]);
  });
});

describe('sanitize', () => {
  it('strips tags but keeps plain comparison text', () => {
    assert.deepEqual(sanitize({ a: ['x <img src=x onerror=alert(1)>', 'a > b'] }), { a: ['x', 'a > b'] });
  });
});

describe('upload checks', () => {
  it('validates magic bytes and sanitises names', () => {
    assert.equal(checkContent({ originalname: 'a.pdf', buffer: Buffer.from('%PDF-1.7') }), 'application/pdf');
    assert.throws(() => checkContent({ originalname: 'a.jpg', buffer: Buffer.from('nope') }));
    assert.throws(() => checkContent({ originalname: 'a.txt', buffer: Buffer.from([0x41, 0x00]) }));
    assert.equal(safeFilename('../../etc/pass wd<>.txt'), 'pass wd_.txt');
  });
});
