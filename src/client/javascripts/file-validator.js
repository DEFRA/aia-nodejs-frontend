const DEFAULT_MAX_FILE_SIZE_MB = 50
const DEFAULT_MAX_FILE_SIZE_BYTES = DEFAULT_MAX_FILE_SIZE_MB * 1024 * 1024 // 50 MB

// ZIP local file header signature: PK\x03\x04
const ZIP_MAGIC = [0x50, 0x4b, 0x03, 0x04]

// Compound Document File (OLE2) magic — used by password-protected OOXML
const OLE2_MAGIC = [0xd0, 0xcf, 0x11, 0xe0]

/**
 * Read the first `length` bytes of a File as a Uint8Array.
 * @param {File} file
 * @param {number} length
 * @returns {Promise<Uint8Array>}
 */
function readBytes(file, length) {
  return new Promise((resolve, reject) => {
    const slice = file.slice(0, length)
    const reader = new FileReader()
    reader.onload = () => resolve(new Uint8Array(reader.result))
    reader.onerror = () => reject(new Error('Failed to read file'))
    reader.readAsArrayBuffer(slice)
  })
}

/**
 * Check whether a byte array starts with the given magic bytes.
 * @param {Uint8Array} bytes
 * @param {number[]} magic
 * @returns {boolean}
 */
function startsWith(bytes, magic) {
  return magic.every((byte, i) => bytes[i] === byte)
}

/**
 * Search for a byte sequence inside a Uint8Array.
 * Returns true if `needle` appears anywhere in `haystack`.
 * @param {Uint8Array} haystack
 * @param {number[]} needle
 * @returns {boolean}
 */
function containsSequence(haystack, needle) {
  for (let i = 0; i <= haystack.length - needle.length; i++) {
    if (needle.every((byte, j) => haystack[i + j] === byte)) return true
  }
  return false
}

/**
 * Scan the ZIP central directory to check whether the archive contains
 * an entry whose filename includes "word/document.xml".
 *
 * We do a lightweight text scan rather than full ZIP parsing — sufficient
 * for detecting a valid DOCX without pulling in a library.
 *
 * @param {Uint8Array} bytes - Full file bytes
 * @returns {boolean}
 */
function zipContainsDocumentXml(bytes) {
  // "word/document.xml" as UTF-8 bytes
  const target = Array.from('word/document.xml').map((c) => c.charCodeAt(0))
  return containsSequence(bytes, target)
}

/**
 * Check whether the ZIP contains an encryption marker used by
 * password-protected OOXML files ("EncryptionInfo" entry name).
 *
 * @param {Uint8Array} bytes - Full file bytes
 * @returns {boolean}
 */
function zipContainsEncryptionInfo(bytes) {
  const target = Array.from('EncryptionInfo').map((c) => c.charCodeAt(0))
  return containsSequence(bytes, target)
}

/**
 * Validate a File object as an unprotected, non-corrupted DOCX.
 *
 * @param {File} file
 * @returns {Promise<{ valid: boolean, message: string }>}
 */
export async function validateDocxFile(file, { maxFileSizeBytes } = {}) {
  const effectiveMaxFileSizeBytes =
    typeof maxFileSizeBytes === 'number' &&
    Number.isFinite(maxFileSizeBytes) &&
    maxFileSizeBytes > 0
      ? maxFileSizeBytes
      : DEFAULT_MAX_FILE_SIZE_BYTES

  // ── 1. Zero-byte check ────────────────────────────────────────────────────
  if (!file || file.size === 0) {
    return {
      valid: false,
      message:
        'Uploaded file is empty (0KB), Please upload a file with valid content'
    }
  }

  // ── 2. File size check ────────────────────────────────────────────────────
  if (file.size > effectiveMaxFileSizeBytes) {
    const maxSizeMb = effectiveMaxFileSizeBytes / (1024 * 1024)
    return {
      valid: false,
      message: `File exceeds the maximum allowed size of ${maxSizeMb} MB`
    }
  }

  // ── 3. Read magic bytes (first 4 bytes) ───────────────────────────────────
  let header
  try {
    header = await readBytes(file, 4)
  } catch {
    return {
      valid: false,
      message: 'The file could not be read'
    }
  }

  // ── 4. Password-protected check (OLE2 compound document) ─────────────────
  // Password-protected DOCX files are wrapped in an OLE2 container, not ZIP.
  if (startsWith(header, OLE2_MAGIC)) {
    return {
      valid: false,
      message: 'Password‑protected file is not supported'
    }
  }

  // ── 5. ZIP signature check ────────────────────────────────────────────────
  // All valid DOCX/OOXML files are ZIP archives starting with PK\x03\x04.
  if (!startsWith(header, ZIP_MAGIC)) {
    return {
      valid: false,
      message: 'Please upload a valid DOCX file'
    }
  }

  // ── 6. Read full file for deeper checks ───────────────────────────────────
  let allBytes
  try {
    allBytes = await readBytes(file, file.size)
  } catch {
    return {
      valid: false,
      message: 'The file could not be read'
    }
  }

  // ── 7. Encryption info inside ZIP (another form of password protection) ───
  // Some tools create a ZIP-wrapped encrypted OOXML — the ZIP entry name
  // "EncryptionInfo" signals the file is password protected.
  if (zipContainsEncryptionInfo(allBytes)) {
    return {
      valid: false,
      message: 'Password‑protected file is not supported'
    }
  }

  // ── 8. Structural DOCX check (must contain word/document.xml) ─────────────
  if (!zipContainsDocumentXml(allBytes)) {
    return {
      valid: false,
      message: 'Please upload a valid DOCX file'
    }
  }

  return { valid: true, message: '' }
}
