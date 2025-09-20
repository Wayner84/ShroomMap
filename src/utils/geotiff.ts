const textDecoder = new TextDecoder();

function normaliseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function decodeSnippet(buffer: ArrayBuffer, maxLength = 2048): string {
  const length = Math.min(buffer.byteLength, maxLength);
  if (length === 0) {
    return '';
  }
  const view = new Uint8Array(buffer, 0, length);
  return textDecoder.decode(view);
}

function extractStructuredMessage(text: string): string | null {
  const patterns = [
    /<ows:ExceptionText>([\s\S]*?)<\/ows:ExceptionText>/i,
    /<ExceptionText>([\s\S]*?)<\/ExceptionText>/i,
    /<ServiceException(?:Text)?>([\s\S]*?)<\/ServiceException(?:Text)?>/i,
    /"message"\s*:\s*"([^"]+)"/i
  ];

  for (const pattern of patterns) {
    const match = pattern.exec(text);
    if (match && match[1]) {
      return normaliseWhitespace(match[1]);
    }
  }

  return null;
}

function contentLooksTextual(contentType: string | null, firstByte: number | undefined): boolean {
  if (contentType) {
    const lowered = contentType.toLowerCase();
    if (lowered.includes('xml') || lowered.includes('json') || lowered.includes('html') || lowered.includes('text')) {
      return true;
    }
  }

  if (firstByte === 60 /* < */ || firstByte === 123 /* { */) {
    return true;
  }

  return false;
}

export function ensureGeoTiffResponse(options: {
  source: string;
  response: Response;
  buffer: ArrayBuffer;
  coverageId?: string;
}): void {
  const { source, response, buffer, coverageId } = options;

  if (buffer.byteLength < 4) {
    const coverageSuffix = coverageId ? ` coverage "${coverageId}"` : '';
    throw new Error(`${source}${coverageSuffix} returned an empty response.`);
  }

  const header = new Uint8Array(buffer, 0, 2);
  const byte0 = header[0];
  const byte1 = header[1];
  const isLittleEndianTiff = byte0 === 0x49 && byte1 === 0x49; // 'II'
  const isBigEndianTiff = byte0 === 0x4d && byte1 === 0x4d; // 'MM'

  if (isLittleEndianTiff || isBigEndianTiff) {
    return;
  }

  const contentType = response.headers.get('content-type');
  if (!contentLooksTextual(contentType, byte0)) {
    const coverageSuffix = coverageId ? ` coverage "${coverageId}"` : '';
    throw new Error(
      `${source}${coverageSuffix} returned unexpected binary data (missing TIFF byte-order marker).`
    );
  }

  const snippet = decodeSnippet(buffer);
  const structuredMessage = extractStructuredMessage(snippet);
  const fallback = normaliseWhitespace(snippet).slice(0, 280);
  const detail = structuredMessage ?? fallback;

  const coverageSuffix = coverageId ? ` coverage "${coverageId}"` : '';
  const messageSuffix = detail ? `: ${detail}` : '.';
  throw new Error(`${source}${coverageSuffix} request failed${messageSuffix}`);
}

export async function wrapGeoTiffDecode<T>(options: {
  source: string;
  coverageId?: string;
  fn: () => Promise<T> | T;
}): Promise<T> {
  const { source, coverageId, fn } = options;
  try {
    return await fn();
  } catch (error) {
    const description = coverageId ? `${source} coverage "${coverageId}"` : source;
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${description} could not be decoded: ${message}`);
  }
}
