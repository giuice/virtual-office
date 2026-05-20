import React from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Company, Space, User } from '@/types/database';
import { CompanySettings } from '@/components/dashboard/company-settings';

const mocks = vi.hoisted(() => ({
  useCompany: vi.fn(),
  showSuccess: vi.fn(),
  showError: vi.fn(),
}));

vi.mock('@/contexts/CompanyContext', () => ({
  useCompany: mocks.useCompany,
}));

vi.mock('@/hooks/useNotification', () => ({
  useNotification: () => ({
    showSuccess: mocks.showSuccess,
    showError: mocks.showError,
  }),
}));

vi.mock('@/components/ui/card', () => ({
  Card: ({ children }: { children: React.ReactNode }) => <section>{children}</section>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardDescription: ({ children }: { children: React.ReactNode }) => <p>{children}</p>,
  CardFooter: ({ children }: { children: React.ReactNode }) => <footer>{children}</footer>,
  CardHeader: ({ children }: { children: React.ReactNode }) => <header>{children}</header>,
  CardTitle: ({ children }: { children: React.ReactNode }) => <h2>{children}</h2>,
}));

vi.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsList: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  TabsTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
}));

vi.mock('@/components/ui/select', () => ({
  Select: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectGroup: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ children }: { children: React.ReactNode }) => <div role="option">{children}</div>,
  SelectLabel: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <button type="button">{children}</button>,
  SelectValue: ({ placeholder }: { placeholder?: string }) => <span>{placeholder}</span>,
}));

vi.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled }: { children: React.ReactNode; onClick?: () => void; disabled?: boolean }) => (
    <button type="button" onClick={onClick} disabled={disabled}>{children}</button>
  ),
}));

vi.mock('@/components/ui/input', () => ({
  Input: (props: React.InputHTMLAttributes<HTMLInputElement>) => <input {...props} />,
}));

vi.mock('@/components/ui/separator', () => ({
  Separator: () => <hr />,
}));

vi.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, disabled }: { checked?: boolean; disabled?: boolean }) => (
    <input type="checkbox" checked={checked} disabled={disabled} readOnly />
  ),
}));

vi.mock('@/components/ui/enhanced-avatar-v2', () => ({
  EnhancedAvatarV2: ({ user }: { user: User }) => <span>{user.displayName}</span>,
}));

vi.mock('lucide-react', () => ({
  Building2: () => <span aria-hidden="true">building-icon</span>,
}));

interface CompanyWithSpaceSettings extends Company {
  settings: Company['settings'] & {
    defaultSpaceId?: string;
    homeSpaces?: Record<string, string>;
  };
}

const mockCompany: CompanyWithSpaceSettings = {
  id: 'company-1',
  name: 'Virtual Office',
  adminIds: ['admin-1'],
  createdAt: '2026-03-19T00:00:00.000Z',
  settings: {
    allowGuestAccess: false,
    maxRooms: 10,
    theme: 'light',
    defaultSpaceId: 'space-default',
    homeSpaces: { 'user-1': 'space-home' },
  },
};

const adminUser: User = {
  id: 'admin-1',
  companyId: 'company-1',
  supabase_uid: 'admin-supabase-id',
  email: 'admin@example.com',
  displayName: 'Ada Admin',
  status: 'online',
  preferences: {},
  role: 'admin',
  lastActive: '2026-03-19T00:00:00.000Z',
  createdAt: '2026-03-19T00:00:00.000Z',
  currentSpaceId: null,
};

const memberWithoutHome: User = {
  ...adminUser,
  id: 'user-2',
  email: 'member@example.com',
  displayName: 'Mina Member',
  role: 'member',
};

const mockSpaces: Space[] = [
  {
    id: 'space-default',
    companyId: 'company-1',
    name: 'Main Workspace',
    type: 'workspace',
    status: 'active',
    capacity: 12,
    features: [],
    position: { x: 0, y: 0, width: 4, height: 2 },
    accessControl: { isPublic: true },
  },
  {
    id: 'space-home',
    companyId: 'company-1',
    name: 'Engineering Home',
    type: 'workspace',
    status: 'available',
    capacity: 8,
    features: [],
    position: { x: 4, y: 0, width: 4, height: 2 },
    accessControl: { isPublic: true },
  },
  {
    id: 'space-in-use',
    companyId: 'company-1',
    name: 'Occupied Lounge',
    type: 'lounge',
    status: 'in_use',
    capacity: 6,
    features: [],
    position: { x: 8, y: 0, width: 4, height: 2 },
    accessControl: { isPublic: true },
  },
  {
    id: 'space-maintenance',
    companyId: 'company-1',
    name: 'Maintenance Room',
    type: 'workspace',
    status: 'maintenance',
    capacity: 6,
    features: [],
    position: { x: 12, y: 0, width: 4, height: 2 },
    accessControl: { isPublic: true },
  },
];

const updateCompanyDetails = vi.fn();

function mockUseCompany(overrides: Partial<ReturnType<typeof baseCompanyContext>> = {}) {
  mocks.useCompany.mockReturnValue({
    ...baseCompanyContext(),
    ...overrides,
  });
}

function baseCompanyContext() {
  return {
    company: mockCompany,
    currentUserProfile: adminUser,
    spaces: mockSpaces,
    companyUsers: [adminUser, memberWithoutHome],
    updateCompanyDetails,
    isLoading: false,
  };
}

describe('Company Settings - Spaces Tab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseCompany();
  });

  it('renders Spaces tab trigger with Building2 icon', () => {
    render(<CompanySettings />);

    expect(screen.getByRole('button', { name: /spaces/i })).toBeInTheDocument();
    expect(screen.getByText('building-icon')).toBeInTheDocument();
  });

  it('renders Company Default Space card with select dropdown', () => {
    render(<CompanySettings />);

    expect(screen.getByText('Company Default Space')).toBeInTheDocument();
    expect(screen.getByText('Choose a space...')).toBeInTheDocument();
    expect(screen.getByText('Currently: Main Workspace')).toBeInTheDocument();
  });

  it('renders Home Space Assignments card with user list', () => {
    render(<CompanySettings />);

    expect(screen.getByText('Home Space Assignments')).toBeInTheDocument();
    expect(screen.getAllByText('Ada Admin').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mina Member').length).toBeGreaterThan(0);
  });

  it('shows "Not assigned" placeholder for users without home space', () => {
    render(<CompanySettings />);

    expect(screen.getAllByText('Not assigned').length).toBeGreaterThan(0);
  });

  it('calls updateCompanyDetails with merged settings on save', () => {
    render(<CompanySettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(updateCompanyDetails).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        allowGuestAccess: false,
        maxRooms: 10,
        theme: 'light',
        defaultSpaceId: 'space-default',
        homeSpaces: { 'user-1': 'space-home' },
      }),
    });
  });

  it('disables inputs for non-admin users by hiding the settings controls', () => {
    mockUseCompany({
      currentUserProfile: memberWithoutHome,
    });

    render(<CompanySettings />);

    expect(screen.getByText('You need administrator privileges to access company settings.')).toBeInTheDocument();
    expect(screen.queryByText('Save Changes')).not.toBeInTheDocument();
  });

  it('preserves existing settings fields when saving space settings', () => {
    render(<CompanySettings />);

    fireEvent.click(screen.getByRole('button', { name: 'Save Changes' }));

    expect(updateCompanyDetails).toHaveBeenCalledWith({
      settings: expect.objectContaining({
        allowGuestAccess: false,
        maxRooms: 10,
        theme: 'light',
      }),
    });
    expect(screen.getAllByText('Occupied Lounge').length).toBeGreaterThan(0);
  });
});
