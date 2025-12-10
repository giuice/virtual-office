import { ProfileForm } from '@/components/profile/ProfileForm';
import { DashboardShell } from '@/components/shell/dashboard-shell';

export default function ProfilePage() {
  return (
    <DashboardShell heading="Meu Perfil" description="Gerencie suas informações pessoais">
      <ProfileForm />
    </DashboardShell>
  );
}
