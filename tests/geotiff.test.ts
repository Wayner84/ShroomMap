import { describe, expect, it } from 'vitest';


import { gzipSync, zipSync } from 'fflate';


import { ensureGeoTiffResponse, extractGeoTiffBuffer, wrapGeoTiffDecode } from '../src/utils/geotiff';

function toArrayBuffer(view: Uint8Array): ArrayBuffer {
  return view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength);
}

describe('extractGeoTiffBuffer', () => {
  it('returns the original buffer for plain GeoTIFF data', () => {
    const buffer = new Uint8Array([0x49, 0x49, 0x2a, 0x00]).buffer;
    expect(extractGeoTiffBuffer(buffer)).toBe(buffer);
  });

  it('extracts the first GeoTIFF entry from a ZIP archive', () => {
    const tifData = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00]);
    const archive = zipSync({
      'meta.txt': new Uint8Array([1, 2, 3]),
      'tile.tif': tifData
    });

    const extracted = extractGeoTiffBuffer(toArrayBuffer(archive));
    expect(new Uint8Array(extracted)).toEqual(tifData);
  });

  it('falls back to the first file when no GeoTIFF is present', () => {
    const payload = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    const archive = zipSync({
      'readme.txt': payload
    });

    const extracted = extractGeoTiffBuffer(toArrayBuffer(archive));
    expect(new Uint8Array(extracted)).toEqual(payload);
  });


  it('inflates GeoTIFF data wrapped in a gzip stream', () => {
    const tifData = new Uint8Array([0x49, 0x49, 0x2a, 0x00, 0x08, 0x00]);
    const compressed = gzipSync(tifData);

    const extracted = extractGeoTiffBuffer(toArrayBuffer(compressed));
    expect(new Uint8Array(extracted)).toEqual(tifData);
  });

});

describe('ensureGeoTiffResponse', () => {
  it('accepts buffers with TIFF byte order markers', () => {
    const buffer = new Uint8Array([0x49, 0x49, 0x2a, 0x00]).buffer;
    const response = new Response(new Uint8Array(), {
      headers: { 'content-type': 'image/tiff' }
    });

    expect(() =>
      ensureGeoTiffResponse({
        source: 'Test',
        response,
        buffer
      })
    ).not.toThrow();
  });

  it('throws a helpful error when an XML exception is returned', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
<ows:ExceptionReport xmlns:ows="http://www.opengis.net/ows">
  <ows:Exception>
    <ows:ExceptionText>Request is invalid</ows:ExceptionText>
  </ows:Exception>
</ows:ExceptionReport>`;
    const encoded = new TextEncoder().encode(xml);
    const buffer = encoded.buffer.slice(encoded.byteOffset, encoded.byteOffset + encoded.byteLength);
    const response = new Response(xml, {
      headers: { 'content-type': 'application/xml' }
    });

    expect(() =>
      ensureGeoTiffResponse({
        source: 'SoilGrids',
        response,
        buffer,
        coverageId: 'phh2o_0-5cm_mean'
      })
    ).toThrowError(/SoilGrids coverage "phh2o_0-5cm_mean" request failed: Request is invalid/);
  });
});

describe('wrapGeoTiffDecode', () => {
  it('re-throws decoding errors with context', async () => {
    await expect(
      wrapGeoTiffDecode({
        source: 'WorldCover',
        coverageId: 'urn:test',
        fn: async () => {
          throw new Error('boom');
        }
      })
    ).rejects.toThrowError('WorldCover coverage "urn:test" could not be decoded: boom');
  });
});
