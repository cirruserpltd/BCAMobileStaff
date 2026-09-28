import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';

import { useAuth } from '@/hooks/use-auth';
import { useViewPreference } from '@/hooks/use-view-preference';
import ViewSwitcherModal from './viewswitchermodal';

const ACCENT = '#2D5BFF';

type UserLevel = 'bdo' | 'tl' | 'all';

type ActionGroup = 'lead' | 'member' | 'loan';

type ActionConfig = {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  iconColor: string;
  borderColor: string;
  group: ActionGroup;

  getCount: (members: MembersSummary | null, loans: LoansMyActions | null) => number | undefined;
  getAmount?: (loans: LoansMyActions | null) => number | undefined;
  route: string;
  routeParams?: Record<string, string | number>;
  visibleTo?: UserLevel[];
};

type MembersSummary = {
  leads_awaiting_allocation_ussd_hq?: number;
  leads_awaiting_allocation_ussd_tl?: number;
  leads_awaiting_allocation_marketing?: number;
  leads_awaiting_assessment?: number;
  leads_awaiting_approval?: number;
  leads_awaiting_onboarding?: number;
  awaiting_hq_approval?: number;
  awaiting_appraisal?: number;
  awaiting_current_limit?: number;
};

type LoanBucket = { total: number; amount: number };
type LoansMyActions = {
  group_loans_pending_bm_approval: LoanBucket;
  individual_loans_pending_bm_approval: LoanBucket;
  group_loans_pending_cm_approval: LoanBucket;
  individual_loans_pending_cm_approval: LoanBucket;
  group_declined_loans: LoanBucket;
  individual_declined_loans: LoanBucket;
  group_loans_pending_disbursement: LoanBucket;
  individual_loans_pending_disbursement: LoanBucket;
  group_active_loans: LoanBucket;
  individual_active_loans: LoanBucket;
};


const ACTIONS: ActionConfig[] = [
  {
    id: 'add_lead',
    label: 'Add a new lead',
    icon: 'person-add',
    color: '#D1F4F7',
    iconColor: '#00BCD4',
    borderColor: '#00BCD4',
    group: 'lead',
    getCount: () => undefined,
    route: '/members/newLead',
  },
  {
    id: 'leads_ussd_tl',
    label: 'Leads awaiting allocation (USSD TL)',
    icon: 'sync',
    color: '#D1F4F7',
    iconColor: '#00BCD4',
    borderColor: '#00BCD4',
    group: 'lead',
    getCount: (m) => m?.leads_awaiting_allocation_ussd_tl,
    route: '/members/ussd',
    routeParams: { status: 'branch_allocated', status_retrieval: 'status' },
    // visibleTo: ['tl', 'all'],
  },
  {
    id: 'leads_ussd_hq',
    label: 'Leads awaiting allocation (USSD HQ)',
    icon: 'sync',
    color: '#D1F4F7',
    iconColor: '#00BCD4',
    borderColor: '#00BCD4',
    group: 'lead',
    getCount: (m) => m?.leads_awaiting_allocation_ussd_hq,
    route: '/members/ussd',
    routeParams: { status: 'pending', status_retrieval: 'status' },
    // visibleTo: ['all'],
  },
  {
    id: 'leads_marketing',
    label: 'Leads awaiting allocation (Marketing)',
    icon: 'sync',
    color: '#D1F4F7',
    iconColor: '#00BCD4',
    borderColor: '#00BCD4',
    group: 'lead',
    getCount: (m) => m?.leads_awaiting_allocation_marketing,
    route: '/members/leadsReport',
  },
  {
    id: 'leads_assessment',
    label: 'Leads awaiting assessment',
    icon: 'document-text',
    color: '#FFF9E6',
    iconColor: '#F57C00',
    borderColor: '#F57C00',
    group: 'lead',
    getCount: (m) => m?.leads_awaiting_assessment,
    route: '/members/leadsReport',
    routeParams: { status: 'pending_assessment', status_retrieval: 'status' },
  },
  {
    id: 'leads_approval',
    label: 'Leads awaiting approvals',
    icon: 'alert-circle',
    color: '#FFEBEE',
    iconColor: '#C62828',
    borderColor: '#C62828',
    group: 'lead',
    getCount: (m) => m?.leads_awaiting_approval,
    route: '/members/leadsReport',
    routeParams: { status: 'pending_approval', status_retrieval: 'status' },
  },
  {
    id: 'leads_onboarding',
    label: 'Leads awaiting member onboarding',
    icon: 'send',
    color: '#E3F2FD',
    iconColor: '#1976D2',
    borderColor: '#1976D2',
    group: 'lead',
    getCount: (m) => m?.leads_awaiting_onboarding,
    route: '/members/leadsReport',
    routeParams: { status: 'approved', status_retrieval: 'status' },
  },
  {
    id: 'members_appraisal',
    label: 'Members awaiting appraisal',
    icon: 'clipboard',
    color: '#E8F5E9',
    iconColor: '#388E3C',
    borderColor: '#4CAF50',
    group: 'member',
    getCount: (m) => m?.awaiting_appraisal,
    route: '/members/membersReport',
  },
  {
    id: 'members_approval',
    label: 'Members awaiting approval',
    icon: 'checkmark-done-circle',
    color: '#E8F5E9',
    iconColor: '#388E3C',
    borderColor: '#4CAF50',
    group: 'member',
    getCount: (m) => m?.awaiting_hq_approval,
    route: '/members/membersReport',
    routeParams: { im_hq_approval: 'none', im_hq_approval_retrieval: 'im_hq_approval' },
    // visibleTo: ['all'],
  },
  
  {
    id: 'members_current_limit',
    label: 'Members awaiting current limit',
    icon: 'trending-up',
    color: '#E8F5E9',
    iconColor: '#388E3C',
    borderColor: '#4CAF50',
    group: 'member',
    getCount: (m) => m?.awaiting_current_limit,
    route: '/members/membersReport',
  },
  {
    id: 'loans_bm',
    label: 'Loans awaiting BM approval',
    icon: 'document-text',
    color: '#FFF9E6',
    iconColor: '#F57C00',
    borderColor: '#F57C00',
    group: 'loan',
    getCount: (_m, l) =>
      l ? l.group_loans_pending_bm_approval.total + l.individual_loans_pending_bm_approval.total : undefined,
    getAmount: (l) =>
      l ? l.group_loans_pending_bm_approval.amount + l.individual_loans_pending_bm_approval.amount : undefined,
    route: '/loan_summary',
    routeParams: { status: 0, status_retrieval: 'status' },
    visibleTo: ['tl', 'all'],
  },
  {
    id: 'loans_hq',
    label: 'Loans awaiting HQ approval',
    icon: 'document-text',
    color: '#FFF9E6',
    iconColor: '#F57C00',
    borderColor: '#F57C00',
    group: 'loan',
    getCount: (_m, l) =>
      l ? l.group_loans_pending_cm_approval.total + l.individual_loans_pending_cm_approval.total : undefined,
    getAmount: (l) =>
      l ? l.group_loans_pending_cm_approval.amount + l.individual_loans_pending_cm_approval.amount : undefined,
    route: '/loan_summary',
    routeParams: { status: 1, status_retrieval: 'status' },
    visibleTo: ['all'],
  },
  {
    id: 'loans_declined',
    label: 'All declined loans',
    icon: 'ban',
    color: '#FFCCAF',
    iconColor: '#E05100',
    borderColor: '#E05100',
    group: 'loan',
    getCount: (_m, l) => (l ? l.group_declined_loans.total + l.individual_declined_loans.total : undefined),
    getAmount: (l) => (l ? l.group_declined_loans.amount + l.individual_declined_loans.amount : undefined),
    route: '/loan_summary',
    routeParams: { status: -1, status_retrieval: 'status' },
  },
  {
    id: 'loans_disbursement',
    label: 'Loans pending disbursement',
    icon: 'paper-plane',
    color: '#AFD9FF',
    iconColor: '#006ED2',
    borderColor: '#006ED2',
    group: 'loan',
    getCount: (_m, l) =>
      l ? l.group_loans_pending_disbursement.total + l.individual_loans_pending_disbursement.total : undefined,
    getAmount: (l) =>
      l ? l.group_loans_pending_disbursement.amount + l.individual_loans_pending_disbursement.amount : undefined,
    route: '/loan_summary',
    routeParams: { status: 2, status_retrieval: 'status' },
  },
  {
    id: 'loans_active',
    label: 'All active loans',
    icon: 'checkmark-circle',
    color: '#B1FFAF',
    iconColor: '#04B900',
    borderColor: '#04B900',
    group: 'loan',
    getCount: (_m, l) => (l ? l.group_active_loans.total + l.individual_active_loans.total : undefined),
    getAmount: (l) => (l ? l.group_active_loans.amount + l.individual_active_loans.amount : undefined),
    route: '/loan_summary',
    routeParams: { status: 3, status_retrieval: 'status' },
  },
];

const REPORTS: {
  id: string;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  route?: string;
  routeParams?: Record<string, string>;
  subtitle?: string;
  color?: string;
  iconColor?: string;
}[] = [
  { id: 'report_leads', label: 'Leads Report', icon: 'bar-chart', route: '/members/leadsReport', subtitle: 'All leads' },
  { id: 'report_members', label: 'Members Report', icon: 'people', route: '/members/membersReport', subtitle: 'All members' },
  {
    id: 'report_loans',
    label: 'Loans Report',
    icon: 'cash',
    route: '/loansReport',
    routeParams: { quick: 'due3' },
    subtitle: 'Loans due in 3 days',
  },
  {
    id: 'report_arrears',
    label: 'Arrears Report',
    icon: 'alert-circle',
    route: '/arrearsReport',
    subtitle: 'Clients with overdue installments',
    color: '#FFEBEE',
    iconColor: '#E53935',
  },
    {
    id: 'report_defaulted_installments',
    label: 'Defaulted Installments',
    icon: 'time',
    route: '/defaultedInstallments',
    subtitle: 'Overdue installments by member',
    color: '#FFF3E0',
    iconColor: '#E65100',
  },
  {
    id: 'report_kpi',
    label: 'KPI Report',
    icon: 'stats-chart',
    route: '/kpi',
    subtitle: 'Key performance indicators',
    color: '#E8F5E9',
    iconColor: '#2E7D32',
  },
];

const fmt = (n?: number) => (typeof n === 'number' ? n.toLocaleString('en-KE', { minimumFractionDigits: 2 }) : '0.00');

function decodeJwtPayload(token: string | null): Record<string, any> | null {
  if (!token) return null;
  try {
    const base64Url = token.split('.')[1];
    if (!base64Url) return null;
    const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
    const padded = base64 + '='.repeat((4 - (base64.length % 4)) % 4);

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let output = '';
    let buffer = 0;
    let bits = 0;
    for (const char of padded) {
      if (char === '=') break;
      const val = chars.indexOf(char);
      if (val === -1) continue;
      buffer = (buffer << 6) | val;
      bits += 6;
      if (bits >= 8) {
        bits -= 8;
        output += String.fromCharCode((buffer >> bits) & 0xff);
      }
    }
    const json = decodeURIComponent(
      output
        .split('')
        .map((c) => '%' + c.charCodeAt(0).toString(16).padStart(2, '0'))
        .join('')
    );
    return JSON.parse(json);
  } catch (e) {
    console.warn('[ActionsScreen] failed to decode JWT payload:', e);
    return null;
  }
}

export default function ActionsScreen() {
  const { authFetch, accessToken } = useAuth();
  const { queryParams, currentViewLabel } = useViewPreference();

  const [showViewSwitcher, setShowViewSwitcher] = useState(false);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [members, setMembers] = useState<MembersSummary | null>(null);
  const [loans, setLoans] = useState<LoansMyActions | null>(null);
  const [error, setError] = useState<string | null>(null);


  const userLevel: UserLevel = useMemo(() => {
    const payload = decodeJwtPayload(accessToken);
    const role = payload?.role ?? payload?.user_group ?? payload?.user_group_name ?? '';
    const normalized = String(role).toLowerCase();
    if (normalized.includes('admin') || normalized.includes('hq')) return 'all';
    if (normalized.includes('tl') || normalized.includes('branch')) return 'tl';
    return 'bdo';
  }, [accessToken]);

  const fetchJson = useCallback(
    async (path: string) => {
      const res = await authFetch(path);
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {

        const text = await res.text().catch(() => '');
        throw new Error(
          `Expected JSON from ${path} but got ${res.status} ${contentType || 'unknown content-type'} ` +
            `(first 80 chars: ${text.slice(0, 80)})`
        );
      }
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Request failed: ${path}`);
      }
      return data.payload;
    },
    [authFetch]
  );

  const fetchAll = useCallback(async () => {
    try {
      setError(null);
      const [membersPayload, loansPayload] = await Promise.all([
        fetchJson(`/api/mobile/staff/members/summary?dummy=1${queryParams}`),
        fetchJson(`/api/mobile/staff/dashboard/myactions?dummy=1${queryParams}`),
      ]);
      setMembers(membersPayload);
      setLoans(loansPayload);
    } catch (e: any) {
      console.warn('[ActionsScreen] fetch failed:', e);
      setError(e?.message || 'Failed to load actions data');
    }
  }, [fetchJson, queryParams]);

  useEffect(() => {
    setLoading(true);
    fetchAll().finally(() => setLoading(false));
  }, [fetchAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchAll();
    setRefreshing(false);
  };

  const handleActionPress = (action: ActionConfig) => {
    if (!action.routeParams) {
      router.push(action.route as any);
      return;
    }
    router.push({ pathname: action.route as any, params: action.routeParams as any });
  };

  // Visible actions for this user's level, in the order they're defined.
  const visibleActions = ACTIONS.filter((a) => !a.visibleTo || a.visibleTo.includes(userLevel));

  const renderAction = (action: ActionConfig) => {
    const count = action.getCount(members, loans);
    const amount = action.getAmount?.(loans);
    return (
      <TouchableOpacity
        key={action.id}
        style={[styles.actionItem, { backgroundColor: action.color, borderColor: action.borderColor }]}
        onPress={() => handleActionPress(action)}
        activeOpacity={0.7}
      >
        <View style={styles.actionContent}>
          <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(255, 255, 255, 0.6)' }]}>
            <Ionicons name={action.icon} size={28} color={action.iconColor} />
          </View>
          <View style={styles.actionTextContainer}>
            <Text style={[styles.actionLabel, { color: action.iconColor }]}>{action.label}</Text>
            {amount !== undefined && <Text style={styles.actionSubtitle}>Ksh {fmt(amount)}</Text>}
          </View>
          {count !== undefined && (
            <View style={[styles.actionBadge, { backgroundColor: 'rgba(255, 255, 255, 0.75)' }]}>
              <Text style={[styles.actionBadgeText, { color: action.iconColor }]}>{loading ? '...' : count}</Text>
            </View>
          )}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={styles.contentContainer}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ACCENT]} tintColor={ACCENT} />}
      >
        {/* Date/header section, matching the rest of the app */}
        <View style={styles.dateSection}>
          <Text style={styles.dateLabel}>My Actions</Text>
          <Text style={styles.switchViewLabel}>Switch View</Text>
          <TouchableOpacity style={styles.currentViewBox} onPress={() => setShowViewSwitcher(true)} activeOpacity={0.7}>
            <View style={styles.currentViewContent}>
              <Ionicons name="business" size={16} color={ACCENT} style={styles.currentViewIcon} />
              <View style={styles.currentViewTextContainer}>
                <Text style={styles.currentViewLabel}>Current View:</Text>
                <Text style={styles.currentViewValue} numberOfLines={1}>
                  {currentViewLabel}
                </Text>
              </View>
              <Ionicons name="chevron-down" size={16} color={ACCENT} />
            </View>
          </TouchableOpacity>
        </View>

        {/* My Actions Section */}
        <View style={styles.actionsSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="checkmark-circle" size={24} color={ACCENT} />
            <Text style={styles.sectionTitle}>My Actions</Text>
          </View>

          {loading ? (
            <ActivityIndicator style={{ marginTop: 40 }} color={ACCENT} size="large" />
          ) : error ? (
            <Text style={styles.errorText}>{error}</Text>
          ) : (
            <View style={styles.actionsContainer}>{visibleActions.map(renderAction)}</View>
          )}
        </View>

        {/* Reports — placeholders, hooked up later */}
        <View style={styles.actionsSection}>
          <View style={styles.sectionHeader}>
            <Ionicons name="bar-chart" size={24} color="#9E9E9E" />
            <Text style={[styles.sectionTitle, { color: '#9E9E9E' }]}>Reports</Text>
          </View>
          <View style={styles.actionsContainer}>
            {REPORTS.map((r) =>
            r.route ? (
                <TouchableOpacity
                key={r.id}
                style={[
                  styles.actionItem,
                  { backgroundColor: r.color ?? '#E3F2FD', borderColor: r.iconColor ?? '#1976D2' },
                ]}
                onPress={() => router.push({ pathname: r.route as any, params: r.routeParams as any })}
                activeOpacity={0.7}
                >
                <View style={styles.actionContent}>
                    <View style={[styles.actionIconContainer, { backgroundColor: 'rgba(255,255,255,0.6)' }]}>
                    <Ionicons name={r.icon} size={26} color={r.iconColor ?? '#1976D2'} />
                    </View>
                    <View style={styles.actionTextContainer}>
                    <Text style={[styles.actionLabel, { color: r.iconColor ?? '#1976D2' }]}>{r.label}</Text>
                    {r.subtitle && <Text style={styles.actionSubtitle}>{r.subtitle}</Text>}
                    </View>
                    <Ionicons name="chevron-forward" size={18} color={r.iconColor ?? '#1976D2'} />
                </View>
                </TouchableOpacity>
            ) : (
                <View key={r.id} style={[styles.actionItem, styles.reportPlaceholder]}>
                <View style={styles.actionContent}>
                    <View style={[styles.actionIconContainer, { backgroundColor: '#EEEEEE' }]}>
                    <Ionicons name={r.icon} size={26} color={r.iconColor ?? '#9E9E9E'} />
                    </View>
                    <Text style={[styles.actionLabel, { color: '#9E9E9E', flex: 1 }]}>{r.label}</Text>
                    <Text style={styles.comingSoon}>Coming soon</Text>
                </View>
                </View>
            )
            )}
          </View>
        </View>
      </ScrollView>

      <ViewSwitcherModal visible={showViewSwitcher} onClose={() => setShowViewSwitcher(false)} />
    </SafeAreaView>
  );
}

/* ------------------------------------------------------------------ */
/* Styles                                                              */
/* ------------------------------------------------------------------ */

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  container: { flex: 1, backgroundColor: '#FFFFFF' },
  contentContainer: { paddingBottom: 40 },

  // Date/header section — matches the reference actions screen
  dateSection: {
    backgroundColor: 'white',
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 20,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  dateLabel: { fontSize: 18, fontWeight: 'bold', color: '#000000', marginBottom: 12 },
  switchViewLabel: { fontSize: 12, color: '#666666', marginBottom: 6, fontWeight: '500' },
  currentViewBox: {
    backgroundColor: '#E3F2FD',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: ACCENT,
  },
  currentViewContent: { flexDirection: 'row', alignItems: 'center' },
  currentViewIcon: { marginRight: 8 },
  currentViewTextContainer: { marginRight: 8 },
  currentViewLabel: { fontSize: 10, color: '#666666', marginBottom: 2 },
  currentViewValue: { fontSize: 13, fontWeight: '600', color: ACCENT },

  actionsSection: { paddingHorizontal: 20, marginBottom: 24 },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: '#000000', marginLeft: 8 },
  actionsContainer: { gap: 12 },

  actionItem: { borderRadius: 12, padding: 12, borderWidth: 2 },
  reportPlaceholder: { backgroundColor: '#FAFAFA', borderColor: '#E0E0E0', opacity: 0.7 },
  actionContent: { flexDirection: 'row', alignItems: 'center' },
  actionIconContainer: {
    width: 40,
    height: 40,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  actionTextContainer: { flex: 1 },
  actionLabel: { fontSize: 13, fontWeight: '600' },
  actionSubtitle: { fontSize: 11, color: '#666666', marginTop: 2 },
  actionBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 14,
    minWidth: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionBadgeText: { fontSize: 13, fontWeight: 'bold' },
  comingSoon: { fontSize: 10, color: '#BDBDBD', marginLeft: 8 },
  errorText: { textAlign: 'center', color: 'red', marginTop: 40, paddingHorizontal: 20 },
});