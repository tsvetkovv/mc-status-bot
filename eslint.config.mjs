import antfu from '@antfu/eslint-config'

export default antfu({
  ignores: ['prisma/migrations/migration_lock.toml'],
})
