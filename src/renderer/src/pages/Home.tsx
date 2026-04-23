import { useEffect, useState } from 'react'
import { worksApi, actorsApi } from '../api'

interface Props {
  onNavigate: (tab: 'works' | 'actors') => void
}

export default function Home({ onNavigate }: Props) {
  const [workCount, setWorkCount] = useState(0)
  const [actorCount, setActorCount] = useState(0)
  const [favWorkCount, setFavWorkCount] = useState(0)
  const [favActorCount, setFavActorCount] = useState(0)

  useEffect(() => {
    worksApi.list().then((list) => setWorkCount((list as unknown[]).length))
    actorsApi.list().then((list) => setActorCount((list as unknown[]).length))
    worksApi.list({ favoriteOnly: true }).then((list) => setFavWorkCount((list as unknown[]).length))
    actorsApi.list({ favoriteOnly: true }).then((list) => setFavActorCount((list as unknown[]).length))
  }, [])

  return (
    <div className="h-full flex flex-col items-center justify-center gap-10">
      <div className="text-center">
        <h1 className="text-5xl font-bold text-white tracking-widest">AMNG</h1>
        <p className="text-gray-500 text-sm mt-2">나만의 미디어 라이브러리</p>
      </div>

      <div className="flex gap-6">
        <button
          onClick={() => onNavigate('works')}
          className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 rounded-xl px-12 py-8 flex flex-col items-center gap-3 transition"
        >
          <span className="text-gray-400 text-sm">작품</span>
          <span className="text-white text-4xl font-bold">{workCount}</span>
          <span className="text-gray-500 text-xs mt-1">편</span>
          {favWorkCount > 0 && (
            <span className="text-red-400 text-xs">♥ {favWorkCount}편 찜</span>
          )}
        </button>

        <button
          onClick={() => onNavigate('actors')}
          className="bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 rounded-xl px-12 py-8 flex flex-col items-center gap-3 transition"
        >
          <span className="text-gray-400 text-sm">배우</span>
          <span className="text-white text-4xl font-bold">{actorCount}</span>
          <span className="text-gray-500 text-xs mt-1">명</span>
          {favActorCount > 0 && (
            <span className="text-red-400 text-xs">♥ {favActorCount}명 찜</span>
          )}
        </button>
      </div>
    </div>
  )
}