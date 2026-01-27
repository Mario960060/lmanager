import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Tasks from './pages/Tasks';
import Materials from './pages/Materials';
import Equipment from './pages/Equipment';
import Finance from './pages/Finance';
import Calculator from './pages/Calculator';
import Calendar from './pages/Calendar';
import EventDetails from './pages/EventDetails';
import EventForm from './pages/EventForm';
import Login from './pages/Login';
import NoTeamPage from './pages/NoTeamPage';
import CreateTeamPage from './pages/CreateTeamPage';
import AuthGuard from './components/AuthGuard';
import ProjectManagement from './pages/ProjectManagement';
import ProjectPerformance from './pages/ProjectManagement/ProjectPerformance';
import SetupPage from './pages/ProjectManagement/SetupPage';
import UserProfile from './pages/UserProfile';
import { useAuthStore } from './lib/store';
import ProjectCreating from './projectmanagement/ProjectCreating';
import UserHoursPage from './components/UserHoursModal';

const queryClient = new QueryClient();

function App() {
  const { theme } = useAuthStore();

  // Apply theme class to html element
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <Router>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/no-team" element={<NoTeamPage />} />
          <Route path="/create-team" element={<CreateTeamPage />} />
          <Route element={<AuthGuard><Layout /></AuthGuard>}>
            <Route path="/" element={<Dashboard />} />
            <Route path="/projects" element={<Projects />} />
            <Route path="/tasks" element={<Tasks />} />
            <Route path="/materials" element={<Materials />} />
            <Route path="/equipment" element={<Equipment />} />
            <Route path="/finance" element={<Finance />} />
            <Route path="/calculator" element={<Calculator />} />
            <Route path="/calendar" element={<Calendar />} />
            <Route path="/events/new" element={<EventForm />} />
            <Route path="/events/:id" element={<EventDetails />} />
            <Route path="/project-management" element={<ProjectManagement />} />
            <Route path="/project-management/create" element={<ProjectCreating />} />
            <Route path="/project-performance" element={<ProjectPerformance />} />
            <Route path="/setup-page" element={<SetupPage />} />
            <Route path="/user-profile" element={<UserProfile />} />
            <Route path="/user-hours" element={<UserHoursPage />} />
          </Route>
        </Routes>
      </Router>
    </QueryClientProvider>
  );
}

export default App;
