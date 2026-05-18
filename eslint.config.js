import neostandard from 'neostandard'

const base = neostandard({
  env: ['node', 'vitest'],
  ignores: [...neostandard.resolveIgnoresFromGitignore()],
  noJsx: true,
  noStyle: true
})

export default [
  ...base,
  {
    files: ['src/client/**/*.js', 'test/client/**/*.js'],
    languageOptions: {
      globals: {
        FileReader: 'readonly',
        MouseEvent: 'readonly',
        document: 'readonly',
        window: 'readonly',
        HTMLScriptElement: 'readonly'
      }
    }
  }
]
