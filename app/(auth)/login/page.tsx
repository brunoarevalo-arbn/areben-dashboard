import { LoginForm } from './LoginForm'

/**
 * Server component fino: solo lee el `?error=` con el que vuelve
 * /auth/callback cuando el ingreso con Google no prospera, y se lo pasa al
 * formulario. Toda la UI vive en LoginForm (cliente).
 */
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>
}) {
  const { error } = await searchParams
  return <LoginForm errorInicial={error} />
}
