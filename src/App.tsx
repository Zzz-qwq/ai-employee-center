import { useState } from 'react';
import Home from './pages/Home';
import BusinessAnalyst from './pages/BusinessAnalyst';
import GrowthManager from './pages/GrowthManager';
import UserResearcher from './pages/UserResearcher';
export default function App(){const [page,setPage]=useState<'home'|'ba'|'gm'|'ur'>('home'); if(page==='ba') return <BusinessAnalyst onHome={()=>setPage('home')}/>; if(page==='gm') return <GrowthManager onHome={()=>setPage('home')}/>; if(page==='ur') return <UserResearcher onHome={()=>setPage('home')}/>; return <Home onEnter={()=>setPage('ba')} onEnterGM={()=>setPage('gm')} onEnterUR={()=>setPage('ur')}/>}
