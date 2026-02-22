import Dashboard from '@/components/Dashboard';

export const metadata = {
  title: 'ZeroGravity Admin',
  description: 'Manage ZeroGravity System easily',
};

export default function Home() {
  return (
    <main>
      <Dashboard />
    </main>
  );
}
