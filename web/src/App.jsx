import React, { useEffect } from 'react';
import {
  Routes,
  Route,
  useLocation
} from 'react-router-dom';

import './css/style.css';

import Home from './pages/Home';
import RemoveBg from './pages/RemoveBg';
import Thumbnails from './pages/Thumbnails';

function App() {
  const location = useLocation();

  useEffect(() => {
    document.querySelector('html').style.scrollBehavior = 'auto'
    window.scroll({ top: 0 })
    document.querySelector('html').style.scrollBehavior = ''
  }, [location.pathname]);

  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/remove-bg" element={<RemoveBg />} />
      <Route path="/thumbnails" element={<Thumbnails />} />
    </Routes>
  );
}

export default App;
