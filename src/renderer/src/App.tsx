import { useState, useCallback, useEffect } from 'react'
import { version } from '../../../package.json'
import Works from './pages/Works'
import Actors from './pages/Actors'
import Home from './pages/Home'
import Dashboard from './pages/Dashboard'
import Ranking from './pages/Ranking'
import Tags from './pages/Tags'
import Labels from './pages/Labels'
import Worldcup from './pages/Worldcup'
import ActorDetailModal from './components/ActorDetailModal'
import WorkDetailModal from './components/WorkDetailModal'

type Tab = 'home' | 'dashboard' | 'ranking' | 'works' | 'actors' | 'labels' | 'tags' | 'worldcup'
type ViewEntry = { type: 'actor'; id: number } | { type: 'work'; id: number }

function App() {
  const [tab, setTab] = useState<Tab>(() => (sessionStorage.getItem('app:tab') as Tab) || 'home')
  const setTabAndSave = useCallback((t: Tab) => { setTab(t); sessionStorage.setItem('app:tab', t) }, [])
  const [viewStack, setViewStack] = useState<ViewEntry[]>([])

  const handleNavigateToActor = useCallback((id: number) => {
    setViewStack((s) => [...s, { type: 'actor', id }])
  }, [])

  const handleNavigateToWork = useCallback((id: number) => {
    setViewStack((s) => [...s, { type: 'work', id }])
  }, [])

  useEffect(() => {
    const splash = document.getElementById('splash')
    if (splash) {
      splash.classList.add('fade-out')
      setTimeout(() => splash.remove(), 400)
    }
  }, [])

  return (
    <div className="h-screen flex flex-col bg-gray-900 text-white">
      <header className="flex items-center border-b border-gray-700 px-4">
        <button
          onClick={() => setTabAndSave('home')}
          className="text-lg font-bold mr-6 py-3 hover:text-blue-400 transition"
        >
          AMNG
        </button>
        <nav className="flex">
          <button
            onClick={() => setTabAndSave('dashboard')}
            className={`px-4 py-3 text-sm border-b-2 transition ${
              tab === 'dashboard'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            대시보드
          </button>
          <button
              onClick={() => setTabAndSave('ranking')}
              className={`px-4 py-3 text-sm border-b-2 transition ${
                  tab === 'ranking'
                      ? 'border-blue-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
          >
            랭킹
          </button>
          <button
            onClick={() => setTabAndSave('works')}
            className={`px-4 py-3 text-sm border-b-2 transition ${
              tab === 'works'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            작품
          </button>
          <button
            onClick={() => setTabAndSave('actors')}
            className={`px-4 py-3 text-sm border-b-2 transition ${
              tab === 'actors'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            배우
          </button>
          <button
            onClick={() => setTabAndSave('labels')}
            className={`px-4 py-3 text-sm border-b-2 transition ${
              tab === 'labels'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            레이블
          </button>
          <button
            onClick={() => setTabAndSave('tags')}
            className={`px-4 py-3 text-sm border-b-2 transition ${
              tab === 'tags'
                ? 'border-blue-500 text-white'
                : 'border-transparent text-gray-400 hover:text-gray-200'
            }`}
          >
            태그
          </button>
          <button
              onClick={() => setTabAndSave('worldcup')}
              className={`px-4 py-3 text-sm border-b-2 transition ${
                  tab === 'worldcup'
                      ? 'border-blue-500 text-white'
                      : 'border-transparent text-gray-400 hover:text-gray-200'
              }`}
          >
            월드컵
          </button>
        </nav>
      </header>
      <main className="flex-1 overflow-hidden">
        {tab === 'home' && (
          <Home onNavigate={(t) => setTabAndSave(t)} />
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
            onNavigateToActor={handleNavigateToActor}
          />
        )}
        {tab === 'actors' && (
          <Actors
            onNavigateToWork={handleNavigateToWork}
            onNavigateToActor={handleNavigateToActor}
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
        {tab === 'worldcup' && (
          <Worldcup
            onNavigateToActor={handleNavigateToActor}
            onNavigateToWork={handleNavigateToWork}
          />
        )}
      </main>

      {tab === 'home' && <span className="fixed bottom-2 right-3 text-xs text-gray-600 pointer-events-none select-none">v{version}</span>}

      {viewStack.length > 0 && (() => {
        const v = viewStack[viewStack.length - 1]
        return v.type === 'actor' ? (
          <ActorDetailModal
            key={`a-${v.id}`}
            actorId={v.id}
            onClose={() => setViewStack([])}
            onViewWork={(id) => setViewStack([{ type: 'work', id }])}
            zIndex={60}
          />
        ) : (
          <WorkDetailModal
            key={`w-${v.id}`}
            workId={v.id}
            onClose={() => setViewStack([])}
            onViewActor={(id) => setViewStack([{ type: 'actor', id }])}
            zIndex={60}
          />
        )
      })()}
    </div>
  )
}

export default App
