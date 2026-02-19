import { useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { handle403Error } from './lib/errorHandler';
import Error403Modal from './components/Error403Modal';
import { CalculatorMenuProvider } from './contexts/CalculatorMenuContext';
import { ThemeProvider } from './themes';
import Layout from './components/Layout';
import Dashboard from './pages/Dashboard';
import Projects from './pages/Projects';
import Tasks from './pages/Tasks';
import Finance from './pages/Finance';
import Calculator from './pages/Calculator';
import Calendar from './pages/Calendar';
import EventDetails from './pages/EventDetails';
import Login from './pages/Login';
import NoTeamPage from './pages/NoTeamPage';
import CreateTeamPage from './pages/CreateTeamPage';
import AuthGuard from './components/AuthGuard';
import ProjectManagement from './pages/ProjectManagement';
import ProjectPerformance from './pages/ProjectManagement/ProjectPerformance';
import SetupPage from './pages/ProjectManagement/SetupPage';
import CompanyPanel from './pages/CompanyPanel';
import UserProfile from './pages/UserProfile';
import { useAuthStore } from './lib/store';
import ProjectCreating from './projectmanagement/ProjectCreating';
import UserHoursPage from './components/UserHoursModal';
import CompanySetupWizard from './pages/CompanySetupWizard';

const queryClient = new QueryClient({
  defaultOptions: {
    mutations: {
      onError: (error) => {
        handle403Error(error);
      },
    },
  },
});

function App() {
  const { theme } = useAuthStore();

  // Apply theme class to html element
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <Error403Modal />
        <CalculatorMenuProvider>
          <Router future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/no-team" element={<NoTeamPage />} />
            <Route path="/create-team" element={<CreateTeamPage />} />
            <Route path="/company-setup" element={<CompanySetupWizard />} />
            <Route element={<AuthGuard><Layout /></AuthGuard>}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/projects" element={<Projects />} />
              <Route path="/tasks" element={<Tasks />} />
              <Route path="/finance" element={<Finance />} />
              <Route path="/calculator" element={<Calculator />} />
              <Route path="/calendar" element={<Calendar />} />
              <Route path="/events/:id" element={<EventDetails />} />
              <Route path="/project-management" element={<ProjectManagement />} />
              <Route path="/project-management/create" element={<ProjectCreating />} />
              <Route path="/project-performance" element={<ProjectPerformance />} />
              <Route path="/setup" element={<SetupPage />} />
              <Route path="/company-panel" element={<CompanyPanel />} />
              <Route path="/user-profile" element={<UserProfile />} />
              <Route path="/user-hours" element={<UserHoursPage />} />
            </Route>
          </Routes>
        </Router>
        </CalculatorMenuProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
