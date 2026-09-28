import AsyncStorage from '@react-native-async-storage/async-storage';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { useAuth } from '@/hooks/use-auth';

type ViewType = 'all' | 'branch' | 'team';

type ViewOptionsPayload = {
  can_view_all: boolean;
  can_switch_branch: boolean;
  can_switch_team: boolean;
  default_view_type: ViewType;
  user_branch_id: number | null;
  user_team_id: number | null;
  branches?: { id: number; name: string }[];
  teams?: { id: number; name: string; branch_id: number }[];
};

type ViewPreferenceContextType = {
  viewType: ViewType | null;
  branchId: number | null;
  teamId: number | null;
  options: ViewOptionsPayload | null;
  loading: boolean;
  currentViewLabel: string;
  setView: (viewType: ViewType, branchId?: number | null, teamId?: number | null) => Promise<void>;
  queryParams: string; // e.g. "&view_type=branch&branch_id=3" — append to dashboard URLs
};

const STORAGE_KEY = 'view_preference';

const ViewPreferenceContext = createContext<ViewPreferenceContextType | null>(null);

export function ViewPreferenceProvider({ children }: { children: ReactNode }) {
  const { authFetch, isAuthenticated } = useAuth();
  const [viewType, setViewType] = useState<ViewType | null>(null);
  const [branchId, setBranchId] = useState<number | null>(null);
  const [teamId, setTeamId] = useState<number | null>(null);
  const [options, setOptions] = useState<ViewOptionsPayload | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!isAuthenticated) return;
    (async () => {
      try {
        const res = await authFetch('/api/mobile/staff/dashboard/view-options');
        const data = await res.json();
        if (data.success) {
          setOptions(data.payload);
          const stored = await AsyncStorage.getItem(STORAGE_KEY);
          if (stored) {
            const parsed = JSON.parse(stored);
            setViewType(parsed.viewType);
            setBranchId(parsed.branchId);
            setTeamId(parsed.teamId);
          } else {
            setViewType(data.payload.default_view_type);
            setBranchId(data.payload.user_branch_id);
            setTeamId(data.payload.user_team_id);
          }
        }
      } catch (e) {
        console.warn('[ViewPreference] Failed to load view options:', e);
      } finally {
        setLoading(false);
      }
    })();
  }, [isAuthenticated, authFetch]);

  const setView = useCallback(
    async (newViewType: ViewType, newBranchId: number | null = null, newTeamId: number | null = null) => {
      setViewType(newViewType);
      setBranchId(newBranchId);
      setTeamId(newTeamId);
      await AsyncStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ viewType: newViewType, branchId: newBranchId, teamId: newTeamId })
      );
    },
    []
  );

  const queryParams = (() => {
    if (!viewType) return '';
    const parts = [`view_type=${viewType}`];
    if (viewType === 'branch' && branchId) parts.push(`branch_id=${branchId}`);
    if (viewType === 'team' && teamId) parts.push(`team_id=${teamId}`);
    return `&${parts.join('&')}`;
  })();

  const currentViewLabel = (() => {
    if (viewType === 'all') return 'All Branches';
    if (viewType === 'branch') {
      const branch = options?.branches?.find((b) => b.id === branchId);
      return branch?.name || 'Branch';
    }
    if (viewType === 'team') {
      const team = options?.teams?.find((t) => t.id === teamId);
      return team?.name || 'My Team';
    }
    return '—';
  })();

  return (
    <ViewPreferenceContext.Provider
      value={{ viewType, branchId, teamId, options, loading, currentViewLabel, setView, queryParams }}
    >
      {children}
    </ViewPreferenceContext.Provider>
  );
}

export function useViewPreference() {
  const ctx = useContext(ViewPreferenceContext);
  if (!ctx) throw new Error('useViewPreference must be used within ViewPreferenceProvider');
  return ctx;
}