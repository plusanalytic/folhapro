import { Outlet } from 'react-router-dom';
import AppSidebar from './AppSidebar';
import TopBar from './TopBar';

export default function AppLayout({ appUser, onLogout }) {
  return (
    <div className="min-h-screen bg-background">
      <AppSidebar />
      <div className="ml-60 flex flex-col min-h-screen">
        <TopBar appUser={appUser} onLogout={onLogout} />
        <main className="flex-1 p-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}