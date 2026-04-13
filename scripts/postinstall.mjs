if (process.env.TAPDANCE_SKIP_POSTINSTALL_NATIVE_CHECK === '1') {
  console.log('[postinstall] Skipping Electron native module check.')
  process.exit(0)
}

await import('./ensure-electron-native-modules.mjs')
