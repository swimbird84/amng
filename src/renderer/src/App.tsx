import { useState, useCallback } from 'react'
import Works from './pages/Works'
import Actors from './pages/Actors'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Ranking from './pages/Ranking'
import Tags from './pages/Tags'
import Labels from './pages/Labels'

type Tab = 'home' | 'dashboard' | 'ranking' | 'works' | 'actors' | 'labels' | 'tags'

function App() {
  const [tab, setTab] = useState<Tab>('home')
  const [navigateToActorId, setNavigateToActorId] = useState<number | null>(null)
  const [navigateToWorkId, setNavigateToWorkId] = useState<number | null>(null)

  const handleNavigateToActor = useCallback((id: number) => {
    setNavigateToActorId(id)
    setTab('actors')
  }, [])

  const handleNavigateToWork = useCallback((id: number) => {
    setNavigateToWorkId(id)
    setTab('works')
  }, [])

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <header className="flex items-center border-b border-gray-700 px-4">
        <button
          onClick={() => setTab('home')}
          className="text-lg font-bold mr-6 py-3 hover:text-blue-400 transition"
        >
          AMNG
        </button>
        <nav className="flex">
          <button
            onClick={() => setTab('dashboard')}
            className={`px-4 py-3 text-sm border-b-2 transition ${
              tab === 'dashboard'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            대시보드
          </button>
          <button
            onClick={() => setTab('ranking')}
            className={`px-4 py-3 text-sm border-b-2 transition ${
              tab === 'ranking'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            랭킹
          </button>
          <button
            onClick={() => setTab('works')}
            className={`px-4 py-3 text-sm border-b-2 transition ${
              tab === 'works'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            작품
          </button>
          <button
            onClick={() => setTab('actors')}
            className={`px-4 py-3 text-sm border-b-2 transition ${
              tab === 'actors'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            배우
          </button>
          <button
            onClick={() => setTab('labels')}
            className={`px-4 py-3 text-sm border-b-2 transition ${
              tab === 'labels'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            레이블
          </button>
          <button
            onClick={() => setTab('tags')}
            className={`px-4 py-3 text-sm border-b-2 transition ${
              tab === 'tags'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            태그
          </button>
        </nav>
      </header>
      <main className="flex-1 overflow-hidden">
        {tab === 'home' && (
          <Home onNavigate={(t) => setTab(t)} />
        )}
        {tab === 'dashboard' && (
          <Dashboard
            onNavigateToWork={handleNavigateToWork}
            onNavigateToActor={handleNavigateToActor}
          />
        )}
        {tab === 'ranking' && (
          <Ranking onNavigateToActor={handleNavigateToActor} />
        )}
        {tab === 'works' && (
          <Works
            navigateToId={navigateToWorkId}
            onNavigateConsumed={() => setNavigateToWorkId(null)}
            onNavigateToActor={handleNavigateToActor}
          />
        )}
        {tab === 'actors' && (
          <Actors
            navigateToId={navigateToActorId}
            onNavigateConsumed={() => setNavigateToActorId(null)}
            onNavigateToWork={handleNavigateToWork}
          />
        )}
        {tab === 'labels' && (
          <Labels onNavigateToWork={handleNavigateToWork} />
        )}
        {tab === 'tags' && (
          <Tags
            onNavigateToWork={handleNavigateToWork}
            onNavigateToActor={handleNavigateToActor}
          />
        )}
      </main>
    </div>
  )
}

export default App
