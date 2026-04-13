import { readFile } from 'node:fs/promises'

const packageJsonPath = new URL('../package.json', import.meta.url)
const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8'))
const version = String(packageJson.version || '').trim()

if (!version) {
  console.error('package.json 缺少 version 字段')
  process.exit(1)
}

const expectedTag = `v${version}`
const actualTag = String(process.argv[2] || process.env.GITHUB_REF_NAME || '').trim()

if (!actualTag) {
  console.log(`Expected release tag: ${expectedTag}`)
  process.exit(0)
}

if (actualTag !== expectedTag) {
  console.error(`Version mismatch: package.json=${version}, git tag=${actualTag}, expected=${expectedTag}`)
  process.exit(1)
}

console.log(`Version tag check passed: ${actualTag}`)
