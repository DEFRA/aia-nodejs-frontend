/**
 * @vitest-environment jsdom
 */

import { validateDocxFile } from './file-validator.js'

// ZIP local file header magic bytes: PK\x03\x04
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]
// OLE2 / Compound Document magic (password-protected DOCX)
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]

/**
 * Build a minimal fake File backed by real bytes.
 * jsdom provides Blob and File globals.
 */
function makeFile(
  bytes,
  name = 'test.docx',
  type = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
) {
  return new File([new Uint8Array(bytes)], name, { type })
}

/** Encode a string as UTF-8 bytes */
function strBytes(str) {
  return Array.from(str).map((c) => c.charCodeAt(0))
}

/** Build a minimal valid DOCX byte array: ZIP magic + "word/document.xml" marker */
function validDocxBytes() {
  const prefix = [...ZIP_MAGIC, ...new Array(100).fill(0)]
  const marker = strBytes('word/document.xml')
  return [...prefix, ...marker]
}

/** Build a valid-ZIP + EncryptionInfo (ZIP-wrapped encrypted OOXML) */
function encryptedZipBytes() {
  const prefix = [...ZIP_MAGIC, ...new Array(100).fill(0)]
  const marker = strBytes('EncryptionInfo')
  return [...prefix, ...marker]
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('validateDocxFile', () => {
  describe('1. Zero-byte / null file', () => {
    test('returns invalid for null', async () => {
      const result = await validateDocxFile(null)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('empty')
    })

    test('returns invalid for a 0-byte file', async () => {
      const file = makeFile([])
      Object.defineProperty(file, 'size', { value: 0 })
      const result = await validateDocxFile(file)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('empty')
    })
  })

  describe('2. File size check', () => {
    test('rejects file larger than default 50 MB limit', async () => {
      const file = makeFile([...ZIP_MAGIC, ...new Array(4).fill(0)])
      // Fake a huge size
      Object.defineProperty(file, 'size', { value: 51 * 1024 * 1024 })
      const result = await validateDocxFile(file)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('50 MB')
    })

    test('rejects file larger than custom maxFileSizeBytes', async () => {
      const file = makeFile([...ZIP_MAGIC, ...new Array(4).fill(0)])
      Object.defineProperty(file, 'size', { value: 11 * 1024 * 1024 })
      const result = await validateDocxFile(file, {
        maxFileSizeBytes: 10 * 1024 * 1024
      })
      expect(result.valid).toBe(false)
      expect(result.message).toContain('10 MB')
    })

    test('includes actual file size MB in the error message', async () => {
      const file = makeFile([...ZIP_MAGIC, ...new Array(4).fill(0)])
      Object.defineProperty(file, 'size', { value: 55 * 1024 * 1024 })
      const result = await validateDocxFile(file)
      expect(result.valid).toBe(false)
      // size message includes the configured max and actual size
      expect(result.message).toContain('MB')
      expect(result.message).toContain('File exceeds the maximum allowed size')
    })

    test('falls back to default 50 MB when maxFileSizeBytes is 0', async () => {
      const bytes = validDocxBytes()
      const file = makeFile(bytes)
      // 0 is invalid — should fall back to 50 MB default, so a 1-byte file passes size check
      const result = await validateDocxFile(file, { maxFileSizeBytes: 0 })
      // file is tiny, so size check passes; should be valid if rest passes
      expect(result.valid).toBe(true)
    })

    test('falls back to default when maxFileSizeBytes is negative', async () => {
      const bytes = validDocxBytes()
      const file = makeFile(bytes)
      const result = await validateDocxFile(file, { maxFileSizeBytes: -1 })
      expect(result.valid).toBe(true)
    })

    test('falls back to default when maxFileSizeBytes is non-finite', async () => {
      const bytes = validDocxBytes()
      const file = makeFile(bytes)
      const result = await validateDocxFile(file, {
        maxFileSizeBytes: Infinity
      })
      expect(result.valid).toBe(true)
    })

    test('falls back to default when maxFileSizeBytes is not a number', async () => {
      const bytes = validDocxBytes()
      const file = makeFile(bytes)
      const result = await validateDocxFile(file, { maxFileSizeBytes: 'big' })
      expect(result.valid).toBe(true)
    })
  })

  describe('4. OLE2 password-protected file', () => {
    test('rejects file with OLE2 magic bytes', async () => {
      const file = makeFile([...OLE2_MAGIC, ...new Array(100).fill(0)])
      const result = await validateDocxFile(file)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('Password')
    })
  })

  describe('5. ZIP signature check', () => {
    test('rejects file with wrong magic bytes (not ZIP)', async () => {
      const file = makeFile([0x00, 0x01, 0x02, 0x03, ...new Array(100).fill(0)])
      const result = await validateDocxFile(file)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('valid DOCX')
    })

    test('rejects a plain text file renamed to .docx', async () => {
      const file = makeFile(strBytes('Hello, this is plain text, not a docx'))
      const result = await validateDocxFile(file)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('valid DOCX')
    })
  })

  describe('7. ZIP-wrapped encrypted OOXML (EncryptionInfo)', () => {
    test('rejects ZIP file containing EncryptionInfo marker', async () => {
      const file = makeFile(encryptedZipBytes())
      const result = await validateDocxFile(file)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('Password')
    })
  })

  describe('8. Structural DOCX check (word/document.xml)', () => {
    test('rejects ZIP that does not contain word/document.xml', async () => {
      // Valid ZIP magic but no word/document.xml entry
      const file = makeFile([...ZIP_MAGIC, ...new Array(100).fill(0x41)])
      const result = await validateDocxFile(file)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('valid DOCX')
    })
  })

  describe('Valid DOCX', () => {
    test('accepts a file with ZIP magic and word/document.xml', async () => {
      const file = makeFile(validDocxBytes())
      const result = await validateDocxFile(file)
      expect(result.valid).toBe(true)
      expect(result.message).toBe('')
    })

    test('accepts with a custom maxFileSizeBytes that is satisfied', async () => {
      const file = makeFile(validDocxBytes())
      const result = await validateDocxFile(file, {
        maxFileSizeBytes: 100 * 1024 * 1024
      })
      expect(result.valid).toBe(true)
    })
  })

  describe('FileReader error (read failure)', () => {
    test('returns invalid when FileReader fires onerror on header read', async () => {
      // Patch FileReader to immediately fire onerror
      const OriginalFileReader = global.FileReader
      global.FileReader = class {
        readAsArrayBuffer() {
          setTimeout(() => this.onerror(new Error('disk error')), 0)
        }
      }

      const file = makeFile([...ZIP_MAGIC, ...new Array(4).fill(0)])
      const result = await validateDocxFile(file)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('could not be read')

      global.FileReader = OriginalFileReader
    })

    test('returns invalid when FileReader fires onerror on full-file read', async () => {
      const OriginalFileReader = global.FileReader
      let callCount = 0
      global.FileReader = class {
        readAsArrayBuffer(slice) {
          callCount++
          if (callCount === 1) {
            // First read (header) succeeds with ZIP magic
            const buf = new ArrayBuffer(4)
            const view = new Uint8Array(buf)
            view[0] = 0x50
            view[1] = 0x4b
            view[2] = 0x03
            view[3] = 0x04
            this.result = buf
            setTimeout(() => this.onload(), 0)
          } else {
            // Second read (full file) fails
            setTimeout(() => this.onerror(new Error('disk error')), 0)
          }
        }
      }

      const file = makeFile([...ZIP_MAGIC, ...new Array(100).fill(0)])
      const result = await validateDocxFile(file)
      expect(result.valid).toBe(false)
      expect(result.message).toContain('could not be read')

      global.FileReader = OriginalFileReader
    })
  })
})
