import { useState } from 'react';
import Home from './pages/Home';
import BusinessAnalyst from './pages/BusinessAnalyst';
import GrowthManager from './pages/GrowthManager';
export default function App(){const [page,setPage]=useState<'home'|'ba'|'gm'>('home'); if(page==='ba') return <BusinessAnalyst onHome={()=>setPage('home')}/>; if(page==='gm') return <GrowthManager onHome={()=>setPage('home')}/>; return <Home onEnter={()=>setPage('ba')} onEnterGM={()=>setPage('gm')}/>}
