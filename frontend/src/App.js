import React from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';

import LoginPage from './components/LoginPage';
import RegisterPage from './components/RegisterPage';
import Header from './components/Header';
import HomePage from './components/HomePage';


function App() {
  return (
    <Router>
      <Header />
      <div className="page-content">
        <Routes>
          {/* Set the root path to LoginPage */}
          <Route path="/" element={<LoginPage />} />

         <Route path="/home" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </div>
    </Router>
  );
}

export default App;
