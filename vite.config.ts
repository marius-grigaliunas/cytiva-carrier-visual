import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'
import fs from 'node:fs'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react({
      babel: {
        plugins: [['babel-plugin-react-compiler']],
      },
    }),
    // Serve public/data under base path in dev (Vite serves public at root by default)
    {
      name: 'serve-data-under-base',
      configureServer(server) {
        const base = '/cytiva-carrier-visual'
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith(`${base}/data/`)) {
            const rel = req.url.slice(base.length)
            const file = path.join(process.cwd(), 'public', rel)
            if (fs.existsSync(file) && fs.statSync(file).isFile()) {
              res.setHeader('Content-Type', getMime(path.extname(file)))
              fs.createReadStream(file).pipe(res)
              return
            }
          }
          next()
        })
      },
    },
  ],
  base: "/cytiva-carrier-visual",
})

function getMime(ext: string): string {
  const mimes: Record<string, string> = {
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls': 'application/vnd.ms-excel',
  }
  return mimes[ext] ?? 'application/octet-stream'
}
