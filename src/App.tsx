import logo from '/Cytiva.svg'

function App() {

  return (
    <div className="min-h-screen flex flex-col bg-gray-100">
      <header className="flex items-center gap-4 px-6 py-4 bg-white border-b border-gray-200 shadow-sm">
        <img src={logo} alt="Cytiva logo" className="h-8 w-auto" />
        <h1 className="text-xl font-semibold text-gray-800 w-full text-left">Carrier dashboard</h1>
        <h2 className="text-md font-semibold text-gray-700 w-full text-right">Created by: <span className="font-bold">Marius Grigaliunas</span></h2>
      </header>
      <main className="flex-1 flex flex-col items-center justify-center p-8 text-center">
        <div className="flex flex-col ">
          <p className="text-sm text-gray-500">
            This is a test of a dashboard for cytiva.
          </p>
        </div>
      </main>
    </div>
  )
}

export default App
