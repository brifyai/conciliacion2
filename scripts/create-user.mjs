// Crea un usuario de la app en Supabase Auth mediante la Admin API.
// Uso:
//   node scripts/create-user.mjs <email> [nombre]
//
// La contraseña se lee de la variable de entorno NEW_USER_PASSWORD para evitar
// exponerla en el historial de la shell.
//
// Variables de entorno requeridas:
//   VITE_SUPABASE_URL          URL del proyecto Supabase
//   SUPABASE_SERVICE_ROLE_KEY  Service role key (solo servidor, nunca en el front)
//   NEW_USER_PASSWORD          Contraseña del nuevo usuario
import { createClient } from '@supabase/supabase-js'

const [, , emailArg, name] = process.argv
const email = emailArg?.trim()
const password = process.env.NEW_USER_PASSWORD

if (!email || !password) {
  console.error('Uso: NEW_USER_PASSWORD=... node scripts/create-user.mjs <email> [nombre]')
  process.exit(1)
}

const supabaseUrl = process.env.VITE_SUPABASE_URL
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!supabaseUrl || !serviceRoleKey) {
  console.error('Faltan VITE_SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el entorno.')
  process.exit(1)
}

const DOMINIOS_PERMITIDOS = ['origencomunicaciones.cl', 'origenmedios.cl']
const dominio = email.toLowerCase().split('@')[1]
if (!DOMINIOS_PERMITIDOS.includes(dominio)) {
  console.error(
    `Dominio no autorizado: "@${dominio}". Solo se permite: ${DOMINIOS_PERMITIDOS.join(', ')}.`,
  )
  process.exit(1)
}

const admin = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const { data, error } = await admin.auth.admin.createUser({
  email,
  password,
  email_confirm: true,
  user_metadata: name ? { name } : {},
})

if (error) {
  console.error('No se pudo crear el usuario:', error.message)
  process.exit(1)
}

console.log('Usuario creado correctamente.')
console.log('  email :', data.user?.email)
console.log('  id    :', data.user?.id)
if (name) console.log('  nombre:', name)
