import { useState } from 'react'
import reactLogo from './assets/react.svg'
import viteLogo from '/vite.svg'

function App() {
  const [count, setCount] = useState(0)

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8 text-center">
      <div className="flex gap-8 justify-center">
        <a href="https://vite.dev" target="_blank">
          <img src={viteLogo} className="h-24 hover:drop-shadow-[0_0_2em_#646cffaa]" alt="Vite logo" />
        </a>
        <a href="https://react.dev" target="_blank">
          <img src={reactLogo} className="h-24 animate-spin hover:drop-shadow-[0_0_2em_#61dafbaa]" alt="React logo" />
        </a>
      </div>
      <h1 className="text-2xl font-bold mb-4">Vite + React</h1>
      <div className="p-8 rounded-lg border border-[#eee] dark:border-[#333]">
        <button
          onClick={() => setCount((count) => count + 1)}
          className="px-4 py-2 rounded bg-[#1a1a1a] text-white font-medium hover:bg-[#646cff] active:scale-[0.98] transition-colors"
        >
          count is {count}
        </button>
        <p className="mt-4 text-[#888]">
          Edit <code className="font-mono bg-[#1a1a1a] px-1 py-0.5 rounded">src/App.tsx</code> and save to test HMR
        </p>
      </div>
      <p className="mt-8 text-sm text-[#888]">
        Click on the Vite and React logos to learn more
      </p>
    </div>
  )
}

export default App
