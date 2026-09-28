import React, { useCallback, useEffect, useMemo, useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
  ActivityIndicator,
  TextInput,
  Modal,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';


import { useAuth } from '@/hooks/use-auth';
import { useViewPreference } from '@/hooks/use-view-preference';
import { useToast } from '@/hooks/use-toast'; 
import AssessmentModal from './AssessmentModal';

const ACCENT = '#2D5BFF';

type Lead = {
  id: number;
  created_at: string;
  name: string;
  phone_number: string;
  business_nature: string | null;
  location: string | null;
  branch: { id: number; name: string } | null;
  product: { id: number; name: string } | null;
  bde: string | null;
  source: string | null;
  status: string;
  team_id: number | null;
};

type LeadAssessment = {
  marketing_type: string | null;
  business_nature: string | null;
  premise_type: string | null;
  stock_type: string | null;
  stock_level: string | null;
  interest_level: string | null;
  personal_character: string | null;
  owns_business: boolean | null;
  is_legitimate: boolean | null;
  loan_purpose: string | null;
  loan_officer: string | null;
  notes: { content: string; author: string | null }[];
  assessed_by: string | null;
  assessed_at: string | null;
};

const STATUS_LABELS: Record<string, string> = {
  pending_assessment: 'Pending Assessment',
  pending_approval: 'Pending Approval',
  approved: 'Approved',
  rejected: 'Rejected',
  onboarded: 'Onboarded',
};

const STATUS_COLORS: Record<string, { bg: string; fg: string }> = {
  pending_assessment: { bg: '#FFF9E6', fg: '#D4BF00' },
  pending_approval: { bg: '#FFCCAF', fg: '#E05100' },
  approved: { bg: '#AFD9FF', fg: '#006ED2' },
  rejected: { bg: '#FFEBEE', fg: '#C62828' },
  onboarded: { bg: '#B1FFAF', fg: '#04B900' },
};

const PER_PAGE = 20;

const pretty = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '—';
  if (typeof v === 'boolean') return v ? 'Yes' : 'No';
  const s = String(v).replace(/_/g, ' ');
  return s.charAt(0).toUpperCase() + s.slice(1);
};

export default function LeadsReportScreen() {
  const { authFetch } = useAuth();
  const { queryParams } = useViewPreference();
  const { showSuccess, showError } = useToast();
  const params = useLocalSearchParams<Record<string, string>>();

  // ACTIONS always filters this screen by `status` (status_retrieval is just
  // along for the ride, matching the web's shortcut-link convention — the
  // field it names is always "status" here, so we don't need to resolve it).
  const initialFilter = useMemo(() => {
    if (params.status) {
      return { value: params.status, label: params.title || STATUS_LABELS[params.status] || params.status };
    }
    return null;
  }, [params]);

  const [filter, setFilter] = useState(initialFilter);
  const [phoneSearch, setPhoneSearch] = useState('');
  const [leads, setLeads] = useState<Lead[]>([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedLead, setSelectedLead] = useState<Lead | null>(null);
  const [assessingLead, setAssessingLead] = useState<Lead | null>(null);
  const [canApprove, setCanApprove] = useState(false);
  const [detail, setDetail] = useState<LeadAssessment | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [deciding, setDeciding] = useState(false);

  const buildQuery = useCallback(
    (targetPage: number) => {
      const parts = [`dummy=1${queryParams}`, `page=${targetPage}`, `per_page=${PER_PAGE}`];
      if (filter) {
        parts.push(`status=${encodeURIComponent(filter.value)}`);
      }
      if (phoneSearch.trim()) {
        parts.push(`phone=${encodeURIComponent(phoneSearch.trim())}`);
      }
      return parts.join('&');
    },
    [queryParams, filter, phoneSearch]
  );

  const fetchLeads = useCallback(
    async (targetPage: number, replace: boolean) => {
      try {
        setError(null);
        const res = await authFetch(`/api/mobile/staff/leads?${buildQuery(targetPage)}`);
        const json = await res.json();
        if (!res.ok || !json.success) {
          throw new Error(json.error || 'Failed to load leads');
        }
        const payload = json.payload;
        setLeads((prev) => (replace ? payload.leads : [...prev, ...payload.leads]));
        setPage(payload.page);
        setTotalPages(payload.total_pages);
        setCanApprove(!!payload.can_approve);
      } catch (e: any) {
        console.warn('[LeadsReportScreen] fetch failed:', e);
        setError(e?.message || 'Failed to load leads');
      }
    },
    [authFetch, buildQuery]
  );

  const fetchRef = useRef(fetchLeads);
    fetchRef.current = fetchLeads;
    const firstFocus = useRef(true);
    useFocusEffect(
      useCallback(() => {
        if (firstFocus.current) {
          firstFocus.current = false;
          return;
        }
        fetchRef.current(1, true);
      }, [])
    );

  // Refetch from page 1 whenever the filter or phone search changes.
  useEffect(() => {
    setLoading(true);
    fetchLeads(1, true).finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, phoneSearch]);

  // Load the assessment when a pending-approval lead is opened.
  useEffect(() => {
    setDetail(null);
    if (!selectedLead || selectedLead.status !== 'pending_approval') return;
    let cancelled = false;
    setDetailLoading(true);
    (async () => {
      try {
        const res = await authFetch(`/api/mobile/staff/leads/${selectedLead.id}`);
        const json = await res.json();
        if (!cancelled && res.ok && json.success) setDetail(json.payload);
      } catch (e) {
        console.warn('[LeadsReportScreen] detail fetch failed:', e);
      } finally {
        if (!cancelled) setDetailLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLead?.id]);

  const onRefresh = async () => {
    setRefreshing(true);
    await fetchLeads(1, true);
    setRefreshing(false);
  };

  const onLoadMore = async () => {
    if (loadingMore || page >= totalPages) return;
    setLoadingMore(true);
    await fetchLeads(page + 1, false);
    setLoadingMore(false);
  };

  const clearFilter = () => {
    // Falls back to the full "New Leads Management" report, unfiltered.
    setFilter(null);
  };

  const submitDecision = async (lead: Lead, action: 'approve' | 'reject') => {
    setDeciding(true);
    let stale = false;
    try {
      const res = await authFetch(`/api/mobile/staff/leads/${lead.id}/${action}`, { method: 'POST' });
      const json = await res.json();
      if (!res.ok || !json.success) {
        stale = res.status === 409; // someone else already handled it
        throw new Error(json.error || `Failed to ${action} lead`);
      }
      // Close the sheet first: the toast lives outside the Modal and would be hidden behind it.
      setSelectedLead(null);
      showSuccess(json.message || `Lead ${action === 'approve' ? 'approved' : 'rejected'} successfully`);
      fetchLeads(1, true); // lead leaves pending_approval, so refresh the list
    } catch (e: any) {
      setSelectedLead(null);
      showError(e?.message || `Failed to ${action} lead`);
      if (stale) fetchLeads(1, true);
    } finally {
      setDeciding(false);
    }
  };

  // Alert stays for the confirmation only, since a toast can't take a Cancel/Confirm choice.
  const decide = (action: 'approve' | 'reject') => {
    const lead = selectedLead;
    if (!lead || deciding) return;
    const verb = action === 'approve' ? 'Approve' : 'Reject';
    Alert.alert(`${verb} lead`, `${verb} ${lead.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: verb,
        style: action === 'reject' ? 'destructive' : 'default',
        onPress: () => submitDecision(lead, action),
      },
    ]);
  };

  const renderItem = ({ item }: { item: Lead }) => {
    const statusColor = STATUS_COLORS[item.status] || { bg: '#EEEEEE', fg: '#666666' };
    return (
      <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => setSelectedLead(item)}>
        <View style={styles.rowMain}>
          <Text style={styles.rowName} numberOfLines={1}>
            {item.name}
          </Text>
          <Text style={styles.rowSubtitle} numberOfLines={1}>
            {[item.business_nature, item.location].filter(Boolean).join(' · ') || '—'}
          </Text>
        </View>
        <View style={styles.rowSide}>
          <Text style={styles.rowPhone}>{item.phone_number}</Text>
          <Text style={styles.rowDate}>{item.created_at ? item.created_at.split(' ')[0] : '—'}</Text>
        </View>
        <View style={[styles.statusBadge, { backgroundColor: statusColor.bg }]}>
          <Text style={[styles.statusBadgeText, { color: statusColor.fg }]} numberOfLines={1}>
            {STATUS_LABELS[item.status] || item.status}
          </Text>
        </View>
        <Ionicons name="chevron-forward" size={16} color="#BDBDBD" style={{ marginLeft: 6 }} />
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="arrow-back" size={22} color="#000" />
        </TouchableOpacity>
        <Text style={styles.headerTitle} numberOfLines={1}>
          {filter ? filter.label : 'New Leads Management'}
        </Text>
        <View style={{ width: 22 }} />
      </View>

      {filter && (
        <View style={styles.filterChipRow}>
          <View style={styles.filterChip}>
            <Text style={styles.filterChipText} numberOfLines={1}>
              {filter.label}
            </Text>
            <TouchableOpacity onPress={clearFilter} hitSlop={8} style={{ marginLeft: 6 }}>
              <Ionicons name="close-circle" size={18} color={ACCENT} />
            </TouchableOpacity>
          </View>
          <Text style={styles.filterHint}>Clear to see all leads</Text>
        </View>
      )}

      <View style={styles.searchRow}>
        <Ionicons name="search" size={16} color="#9E9E9E" style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          placeholder="Search by phone"
          value={phoneSearch}
          onChangeText={setPhoneSearch}
          keyboardType="phone-pad"
        />
      </View>

      {loading ? (
        <ActivityIndicator style={{ marginTop: 40 }} color={ACCENT} size="large" />
      ) : error ? (
        <Text style={styles.errorText}>{error}</Text>
      ) : leads.length === 0 ? (
        <Text style={styles.emptyText}>No leads found.</Text>
      ) : (
        <FlatList
          data={leads}
          keyExtractor={(item) => String(item.id)}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 24 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[ACCENT]} tintColor={ACCENT} />}
          onEndReachedThreshold={0.3}
          onEndReached={onLoadMore}
          ListFooterComponent={loadingMore ? <ActivityIndicator style={{ marginVertical: 16 }} color={ACCENT} /> : null}
        />
      )}

      <Modal visible={!!selectedLead} animationType="slide" transparent onRequestClose={() => setSelectedLead(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalSheet}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedLead?.name}</Text>
              <TouchableOpacity onPress={() => setSelectedLead(null)} hitSlop={10}>
                <Ionicons name="close" size={22} color="#000" />
              </TouchableOpacity>
            </View>

            <ScrollView>
              {selectedLead && (
                <View style={styles.detailList}>
                  <DetailRow label="Phone" value={selectedLead.phone_number} />
                  <DetailRow label="Business" value={selectedLead.business_nature} />
                  <DetailRow label="Location" value={selectedLead.location} />
                  <DetailRow label="Branch" value={selectedLead.branch?.name} />
                  <DetailRow label="Product" value={selectedLead.product?.name} />
                  <DetailRow label="Source" value={selectedLead.source} />
                  <DetailRow label="BDE" value={selectedLead.bde} />
                  <DetailRow label="Date" value={selectedLead.created_at?.split(' ')[0]} />
                  <DetailRow label="Status" value={STATUS_LABELS[selectedLead.status] || selectedLead.status} />
                </View>
              )}

              {selectedLead?.status === 'pending_approval' && (
                <>
                  <Text style={styles.sectionTitle}>Assessment</Text>
                  {detailLoading ? (
                    <ActivityIndicator color={ACCENT} style={{ marginVertical: 12 }} />
                  ) : detail ? (
                    <View style={styles.detailList}>
                      <DetailRow label="Marketing type" value={pretty(detail.marketing_type)} />
                      <DetailRow label="Premise type" value={pretty(detail.premise_type)} />
                      <DetailRow label="Stock type" value={pretty(detail.stock_type)} />
                      <DetailRow label="Stock level" value={pretty(detail.stock_level)} />
                      <DetailRow label="Interest level" value={pretty(detail.interest_level)} />
                      <DetailRow label="Personal character" value={pretty(detail.personal_character)} />
                      <DetailRow label="Owns business" value={pretty(detail.owns_business)} />
                      <DetailRow label="Legitimate" value={pretty(detail.is_legitimate)} />
                      <DetailRow label="Loan purpose" value={detail.loan_purpose} />
                      <DetailRow label="Loan officer" value={detail.loan_officer} />
                      <DetailRow label="Assessed by" value={detail.assessed_by} />
                      <DetailRow label="Assessed on" value={detail.assessed_at} />
                      {detail.notes.map((n, i) => (
                        <DetailRow key={i} label={n.author ? `Note (${n.author})` : 'Note'} value={n.content} />
                      ))}
                    </View>
                  ) : (
                    <Text style={styles.assessmentError}>Couldn't load the assessment.</Text>
                  )}
                </>
              )}
            </ScrollView>

            {selectedLead?.status === 'pending_assessment' && (
              <TouchableOpacity
                style={styles.assessButton}
                onPress={() => {
                  const lead = selectedLead;
                  setSelectedLead(null);
                  setAssessingLead(lead);
                }}
              >
                <Text style={styles.assessButtonText}>Assess Lead</Text>
              </TouchableOpacity>
            )}

            {selectedLead?.status === 'pending_approval' &&
              (canApprove ? (
                <View style={styles.decisionRow}>
                  <TouchableOpacity
                    style={[styles.rejectButton, deciding && { opacity: 0.5 }]}
                    disabled={deciding}
                    onPress={() => decide('reject')}
                  >
                    <Text style={styles.rejectButtonText}>Reject</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.approveButton, deciding && { opacity: 0.5 }]}
                    disabled={deciding}
                    onPress={() => decide('approve')}
                  >
                    {deciding ? (
                      <ActivityIndicator color="#FFF" />
                    ) : (
                      <Text style={styles.approveButtonText}>Approve</Text>
                    )}
                  </TouchableOpacity>
                </View>
              ) : (
                <Text style={styles.assessmentError}>Awaiting approval by a team lead.</Text>
              ))}

              {selectedLead?.status === 'approved' && (
                <TouchableOpacity style={styles.assessButton} onPress={() => {
                  const lead = selectedLead;
                  setSelectedLead(null);
                  router.push({ pathname: '/members/onboard', params: {
                    lead_id: String(lead.id), name: lead.name, phone: lead.phone_number,
                    branch_id: lead.branch ? String(lead.branch.id) : '',
                    team_id: lead.team_id != null ? String(lead.team_id) : '' } });
                }}>
                  <Text style={styles.assessButtonText}>Onboard Member</Text>
                </TouchableOpacity>
              )}
          </View>
        </View>
      </Modal>

      <AssessmentModal
        visible={!!assessingLead}
        lead={assessingLead}
        authFetch={authFetch}
        onClose={() => setAssessingLead(null)}
        onSubmitted={() => {
          setAssessingLead(null);
          fetchLeads(1, true); // the lead just moved to pending_approval — refresh the list/counts
        }}
      />
    </SafeAreaView>
  );
}

function DetailRow({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <View style={styles.detailRow}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={styles.detailValue}>{value || '—'}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: '#FFFFFF' },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  headerTitle: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: 'bold', color: '#000' },

  filterChipRow: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 10 },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5,
    maxWidth: '70%',
  },
  filterChipText: { fontSize: 12, fontWeight: '600', color: ACCENT },
  filterHint: { fontSize: 11, color: '#9E9E9E', marginLeft: 8 },

  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 10,
    marginHorizontal: 16,
    marginVertical: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  searchInput: { flex: 1, fontSize: 13, color: '#000' },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F5F5F5',
  },
  rowMain: { flex: 1.4, marginRight: 8 },
  rowName: { fontSize: 14, fontWeight: '600', color: '#000' },
  rowSubtitle: { fontSize: 11, color: '#888', marginTop: 2 },
  rowSide: { flex: 1, marginRight: 8 },
  rowPhone: { fontSize: 12, color: '#333' },
  rowDate: { fontSize: 11, color: '#9E9E9E', marginTop: 2 },
  statusBadge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 10, maxWidth: 92 },
  statusBadgeText: { fontSize: 10, fontWeight: '700' },

  errorText: { textAlign: 'center', color: 'red', marginTop: 40, paddingHorizontal: 20 },
  emptyText: { textAlign: 'center', color: '#9E9E9E', marginTop: 40 },

  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: '#FFF', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, maxHeight: '75%' },
  modalHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  modalTitle: { fontSize: 16, fontWeight: 'bold', color: '#000' },
  detailList: { gap: 10 },
  detailRow: { flexDirection: 'row', justifyContent: 'space-between' },
  detailLabel: { fontSize: 12, color: '#9E9E9E' },
  detailValue: { fontSize: 13, color: '#000', fontWeight: '500', maxWidth: '65%', textAlign: 'right' },
  assessButton: { backgroundColor: ACCENT, borderRadius: 10, paddingVertical: 12, alignItems: 'center', marginTop: 16 },
  assessButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },

  sectionTitle: { fontSize: 13, fontWeight: '700', color: '#000', marginTop: 18, marginBottom: 10 },
  assessmentError: { fontSize: 12, color: '#9E9E9E', textAlign: 'center', marginTop: 12 },
  decisionRow: { flexDirection: 'row', gap: 10, marginTop: 16 },
  approveButton: { flex: 1, backgroundColor: '#04B900', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  approveButtonText: { color: '#FFF', fontWeight: '700', fontSize: 14 },
  rejectButton: { flex: 1, borderWidth: 1, borderColor: '#C62828', borderRadius: 10, paddingVertical: 12, alignItems: 'center' },
  rejectButtonText: { color: '#C62828', fontWeight: '700', fontSize: 14 },
});