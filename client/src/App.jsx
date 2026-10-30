import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Layout } from './components/Layout';
import { Dashboard } from './pages/Dashboard';
import { MeetingsList } from './pages/MeetingsList';
import { MeetingDetail } from './pages/MeetingDetail';
import { NewMeeting } from './pages/NewMeeting';
import { ActionTracker } from './pages/ActionTracker';
import { DecisionRegister } from './pages/DecisionRegister';
import { AskMeetings } from './pages/AskMeetings';
import { Settings } from './pages/Settings';

export function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="meetings" element={<MeetingsList />} />
          <Route path="meetings/:id" element={<MeetingDetail />} />
          <Route path="new" element={<NewMeeting />} />
          <Route path="tasks" element={<ActionTracker />} />
          <Route path="decisions" element={<DecisionRegister />} />
          <Route path="ask" element={<AskMeetings />} />
          <Route path="settings" element={<Settings />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
