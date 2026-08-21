import postgres from "postgres";

// Esta base ha estado fallando la conexión de forma intermitente
// (CONNECT_TIMEOUT que va y viene, sin que cambie nada de la configuración)
// — pinta a algo de red entre esta máquina y DigitalOcean, no del código.
// En vez de que haya que volver a correr el comando a mano cada vez que se
// atora, reintentamos solos antes de darnos por vencidos.
export async function connectWithRetry(url, { attempts = 6, delayMs = 4000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const sql = postgres(url, { connect_timeout: 10 });
    try {
      await sql`SELECT 1`;
      return sql;
    } catch (err) {
      lastError = err;
      await sql.end({ timeout: 1 }).catch(() => {});
      if (attempt === attempts) break;
      console.log(`Intento ${attempt}/${attempts} falló (${err.code ?? err.message}), reintentando en ${delayMs / 1000}s...`);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
  throw lastError;
}
